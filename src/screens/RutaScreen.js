import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Location from 'expo-location'
import { useAuth } from '../context/AuthContext'
import { fechaDisplayVzla } from '../lib/fecha'
import { distanciaMetros } from '../lib/geo'
import { registrarEvento } from '../lib/eventos'
import { detenerTracking, iniciarTracking, pedirExencionBateria } from '../lib/gps'
import { activarRuta, actualizarEstadoParada, cargarRutaHoy, completarRuta, cargarSiguienteRuta } from '../lib/ruta'
import { cargarEntregaConfig, ENTREGA_CONFIG_DEFAULT } from '../lib/entregaConfig'
import { subirArchivoEntrega } from '../lib/entregas'
import { capturarFotoEntrega } from '../lib/foto'
import FirmaModal from '../components/FirmaModal'
import { supabase } from '../lib/supabase'
import { colors, radius, shadow } from '../theme'

// ─── estados de parada (con ícono vectorial) ────────────────────────────────
const ESTADO = {
  pendiente: { label: 'Pendiente',    fg: colors.textSoft, bg: colors.bg,        acento: colors.textMuted, icon: 'ellipse-outline' },
  en_sitio:  { label: 'En sitio',     fg: colors.primary,  bg: colors.infoBg,    acento: colors.primary,   icon: 'navigate' },
  entregado: { label: 'Entregado',    fg: colors.success,  bg: colors.successBg, acento: colors.success,   icon: 'checkmark-circle' },
  fallido:   { label: 'No entregado', fg: colors.danger,   bg: colors.dangerBg,  acento: colors.danger,    icon: 'close-circle' },
  rechazado: { label: 'Rechazado',    fg: colors.orange,   bg: colors.orangeBg,  acento: colors.orange,    icon: 'hand-left' },
}

// ─── tipo de parada ─────────────────────────────────────────────────────────
const TIPO_PARADA = {
  entrega:          { label: 'Entrega',  color: colors.primary, icon: 'cube-outline' },
  recogida:         { label: 'Recogida', color: '#7C3AED',      icon: 'arrow-up-circle-outline' },
  entrega_recogida: { label: 'E + R',    color: '#0891B2',      icon: 'swap-horizontal' },
  servicio:         { label: 'Servicio', color: colors.warning, icon: 'construct-outline' },
}

function formatearTiempo(seg) {
  const m = Math.floor(seg / 60)
  const s = seg % 60
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function saludo() {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return 'Buenos días'
  if (h >= 12 && h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

// El umbral de proximidad para la prueba de entrega (radio en metros) ahora lo
// configura cada empresa en el panel (Configuración → Entregas); el default de
// 150 m vive en ENTREGA_CONFIG_DEFAULT y aplica si el tenant no configuró nada.

// Posición actual para la prueba de entrega. Best-effort: primero GPS fresco
// (con timeout), luego la última posición conocida, y si todo falla retorna
// null — NUNCA bloqueamos una entrega por falta de señal (zonas rurales).
async function obtenerPosicionEntrega() {
  try {
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout GPS')), 8000)),
    ])
    if (pos?.coords) return pos.coords
  } catch (_) {}
  try {
    const pos = await Location.getLastKnownPositionAsync()
    if (pos?.coords) return pos.coords
  } catch (_) {}
  return null
}

// ¿La config del tenant exige este certificado (firma/foto) para la entrega?
function exigeCertificado(modo, fueraDeSitio) {
  return modo === 'siempre' || (modo === 'fuera_de_sitio' && fueraDeSitio === true)
}

// Confirmación cuando el conductor marca una parada lejos del cliente.
function confirmarLejosDelCliente(distancia, nombreCliente, nuevoEstado) {
  const accion = nuevoEstado === 'entregado' ? 'entrega' : 'no entrega'
  return new Promise((resolve) => {
    Alert.alert(
      'Estás lejos del cliente',
      `Estás a ~${Math.round(distancia)} m de ${nombreCliente ?? 'el cliente'}. ¿Confirmar ${accion} de todas formas?`,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Confirmar', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    )
  })
}

// ─── Tarjeta de métrica ─────────────────────────────────────────────────────
function StatCard({ icon, num, label, color }) {
  return (
    <View style={st.statCard}>
      <View style={[st.statIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[st.statNum, { color }]}>{num}</Text>
      <Text style={st.statLabel}>{label}</Text>
    </View>
  )
}

export default function RutaScreen({ navigation }) {
  const { conductor, cerrarSesion } = useAuth()
  const insets = useSafeAreaInsets()
  const [ruta, setRuta]             = useState(null)
  const [paradas, setParadas]       = useState([])
  const [cargando, setCargando]     = useState(true)
  const [refresco, setRefresco]     = useState(false)
  const [error, setError]           = useState(null)
  const [accionando, setAccionando] = useState(null)
  const [gpsActivo, setGpsActivo]   = useState(false)
  const [tiemposEnSitio, setTiemposEnSitio] = useState({})
  const [entregaCfg, setEntregaCfg] = useState(ENTREGA_CONFIG_DEFAULT)
  const [firmaVisible, setFirmaVisible] = useState(false)
  const [firmaCliente, setFirmaCliente] = useState('')
  const trackingRef  = useRef(null)
  const accionandoRef = useRef(null)
  const rutaIdRef    = useRef(null)
  const firmaResolverRef = useRef(null)

  // Abre el modal de firma y espera el resultado (base64 PNG, o null si canceló)
  function pedirFirma(parada) {
    setFirmaCliente(parada.clientes?.nombre ?? '')
    setFirmaVisible(true)
    return new Promise((resolve) => { firmaResolverRef.current = resolve })
  }
  function cerrarFirma(resultado) {
    setFirmaVisible(false)
    const resolver = firmaResolverRef.current
    firmaResolverRef.current = null
    resolver?.(resultado)
  }

  // Config de certificación de entrega del tenant (radio configurable)
  useEffect(() => {
    if (!conductor) return
    cargarEntregaConfig().then(setEntregaCfg)
  }, [conductor])

  const cargar = useCallback(async () => {
    if (!conductor) return
    setError(null)
    try {
      const datos = await cargarRutaHoy(conductor.id)
      setRuta(datos?.ruta ?? null)
      setParadas(datos?.paradas ?? [])
      rutaIdRef.current = datos?.ruta?.id ?? null
    } catch (e) {
      setError(e?.message ?? String(e))
    }
  }, [conductor])

  // Solo recarga paradas — no toca el estado de la ruta
  const recargarParadas = useCallback(async () => {
    const rutaId = rutaIdRef.current
    if (!rutaId) return
    try {
      const { data, error } = await supabase
        .from('paradas')
        .select('*, clientes(*)')
        .eq('ruta_id', rutaId)
        .order('orden')
      if (!error && data) setParadas(data)
    } catch (_) {}
  }, [])

  useEffect(() => {
    setCargando(true)
    cargar().finally(() => setCargando(false))
  }, [cargar])

  // ── Realtime — solo actualiza paradas, nunca sobreescribe el estado de la ruta ──
  useEffect(() => {
    if (!ruta?.id) return
    const canal = supabase
      .channel(`paradas-${ruta.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'paradas', filter: `ruta_id=eq.${ruta.id}` },
        () => { if (accionandoRef.current) return; recargarParadas() },
      )
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [ruta?.id, recargarParadas])

  // ── GPS ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (ruta?.estado === 'en_ruta' && conductor) {
      iniciarTracking(conductor.id, ruta.id)
        .then((sub) => {
          trackingRef.current = sub
          setGpsActivo(true)
          // Una sola vez: pedir que el sistema no mate el rastreo por batería.
          pedirExencionBateria()
          if (sub && sub.background === false) {
            Alert.alert(
              'Activa "Permitir todo el tiempo"',
              'Para que el despacho te vea en el mapa aunque bloquees el teléfono o uses otra app, abre Ajustes → Permisos → Ubicación y elige "Permitir todo el tiempo".',
              [
                { text: 'Ahora no', style: 'cancel' },
                { text: 'Abrir Ajustes', onPress: () => Linking.openSettings() },
              ],
            )
          }
        })
        .catch((e) => {
          console.warn('[GPS]', e?.message)
          setGpsActivo(false)
          Alert.alert(
            'Sin permiso de ubicación',
            'No podemos registrar tu ruta para el despacho. Abre Ajustes → Permisos → Ubicación y concede el acceso.',
            [
              { text: 'Ahora no', style: 'cancel' },
              { text: 'Abrir Ajustes', onPress: () => Linking.openSettings() },
            ],
          )
        })
    } else {
      detenerTracking(trackingRef.current)
      trackingRef.current = null
      setGpsActivo(false)
    }
    return () => { detenerTracking(trackingRef.current); trackingRef.current = null }
    // Incluye ruta?.id: al cargar una SEGUNDA ruta del día (aunque siga en
    // estado en_ruta), reiniciamos el tracking para que los puntos se etiqueten
    // con el id de la ruta nueva y no se mezclen con el despacho anterior.
  }, [ruta?.estado, ruta?.id, conductor])

  // ── Timers en sitio ───────────────────────────────────────────────────────
  useEffect(() => {
    const enSitio = paradas.filter((p) => p.estado === 'en_sitio' && p.ts_llegada)
    if (enSitio.length === 0) return
    const iv = setInterval(() => {
      setTiemposEnSitio((prev) => {
        const n = { ...prev }
        for (const p of enSitio)
          n[p.id] = Math.round((Date.now() - new Date(p.ts_llegada).getTime()) / 1000)
        return n
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [paradas])

  // ── Acciones ──────────────────────────────────────────────────────────────
  async function onIniciarRuta() {
    if (!ruta) return
    accionandoRef.current = 'iniciar'
    setAccionando('iniciar')
    setError(null)
    try {
      await activarRuta(ruta.id)
      await registrarEvento('ruta_iniciada', {}, { conductorId: conductor.id, rutaId: ruta.id })
      setRuta((r) => ({ ...r, estado: 'en_ruta' }))
    } catch (e) { setError(e?.message ?? String(e)) }
    finally { accionandoRef.current = null; setAccionando(null) }
  }

  async function onMarcarParada(parada, nuevoEstado) {
    if (accionandoRef.current) return
    accionandoRef.current = parada.id
    setAccionando(parada.id)
    setError(null)
    try {
      // Prueba de entrega: solo para estados terminales capturamos la posición
      // del conductor y validamos la distancia al cliente.
      const esTerminal = nuevoEstado === 'entregado' || nuevoEstado === 'fallido' || nuevoEstado === 'rechazado'
      let extra = null
      if (esTerminal) {
        const coords = await obtenerPosicionEntrega()
        if (coords) {
          extra = { entrega_lat: coords.latitude, entrega_lng: coords.longitude }
          const cliente = parada.clientes
          if (cliente?.lat && cliente?.lng) {
            const radio = entregaCfg.radio_entrega_m ?? ENTREGA_CONFIG_DEFAULT.radio_entrega_m
            const distancia = distanciaMetros(coords.latitude, coords.longitude, cliente.lat, cliente.lng)
            extra.distancia_cliente_m = Math.round(distancia)
            extra.fuera_de_sitio = distancia > radio
            if (distancia > radio) {
              const confirmado = await confirmarLejosDelCliente(distancia, cliente?.nombre, nuevoEstado)
              if (!confirmado) return
            }
          }
        }
      }
      // Firma del cliente (solo entregas exitosas, según config del tenant).
      // Si el chofer cancela el modal, la parada NO se marca.
      if (nuevoEstado === 'entregado' && exigeCertificado(entregaCfg.firma_modo, extra?.fuera_de_sitio)) {
        const firma = await pedirFirma(parada)
        if (firma == null) return
        const firmaPath = await subirArchivoEntrega(parada, firma, 'firma')
        if (firmaPath) {
          extra = { ...(extra ?? {}), firma_path: firmaPath }
        } else {
          Alert.alert('Sin conexión', 'No se pudo subir la firma; la entrega se registrará sin ella.')
        }
      }

      // Foto de la entrega (requiere APK 1.3.0+; en versiones sin cámara se
      // omite). Si el chofer cancela la cámara, la parada NO se marca.
      if (nuevoEstado === 'entregado' && exigeCertificado(entregaCfg.foto_modo, extra?.fuera_de_sitio)) {
        const foto = await capturarFotoEntrega()
        if (foto.cancelada) return
        if (foto.base64) {
          const fotoPath = await subirArchivoEntrega(parada, foto.base64, 'foto')
          if (fotoPath) {
            extra = { ...(extra ?? {}), foto_path: fotoPath }
          } else {
            Alert.alert('Sin conexión', 'No se pudo subir la foto; la entrega se registrará sin ella.')
          }
        }
      }

      await actualizarEstadoParada(parada.id, nuevoEstado, extra)
      const tipo = nuevoEstado === 'en_sitio' ? 'llegada_parada' : `parada_${nuevoEstado}`
      const payload = { cliente: parada.clientes?.nombre }
      if (extra?.distancia_cliente_m != null) {
        payload.distancia_cliente_m = extra.distancia_cliente_m
        payload.fuera_de_sitio = extra.fuera_de_sitio
      }
      await registrarEvento(tipo, payload, {
        conductorId: conductor.id, rutaId: ruta.id, paradaId: parada.id,
      })
      setParadas((prev) => prev.map((p) => p.id === parada.id ? { ...p, estado: nuevoEstado, ...(extra ?? {}) } : p))
    } catch (e) { setError(e?.message ?? String(e)) }
    finally { accionandoRef.current = null; setAccionando(null) }
  }

  async function onRefrescar() {
    setRefresco(true)
    await cargar()
    setRefresco(false)
  }

  async function onCompletarRuta() {
    if (!ruta) return
    setAccionando('completar')
    setError(null)
    try {
      await completarRuta(ruta.id)
      await registrarEvento('ruta_completada', {}, { conductorId: conductor.id, rutaId: ruta.id })
      setRuta((r) => ({ ...r, estado: 'completada' }))
    } catch (e) { setError(e?.message ?? String(e)) }
    finally { setAccionando(null) }
  }

  async function onCargarSiguienteRuta() {
    if (!ruta || !conductor) return
    setAccionando('siguiente')
    setError(null)
    try {
      const siguiente = await cargarSiguienteRuta(conductor.id, ruta.id)
      if (!siguiente) {
        Alert.alert('Sin más rutas', 'No hay más rutas pendientes para hoy.')
        return
      }
      setRuta(siguiente.ruta)
      setParadas(siguiente.paradas)
      rutaIdRef.current = siguiente.ruta.id
    } catch (e) { setError(e?.message ?? String(e)) }
    finally { setAccionando(null) }
  }

  // Delegamos en onMarcarParada para que el rechazo también capture la
  // posición del conductor (prueba de entrega) y valide la distancia.
  async function onMarcarRechazado(parada) {
    await onMarcarParada(parada, 'rechazado')
  }

  function abrirNavegacion(lat, lng, nombre) {
    if (!lat || !lng) {
      Alert.alert('Sin ubicación', 'Este cliente no tiene coordenadas registradas.')
      return
    }
    Alert.alert(`Navegar a ${nombre}`, '¿Con qué app?', [
      { text: 'Google Maps', onPress: () => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`) },
      { text: 'Waze',        onPress: () => Linking.openURL(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`) },
      { text: 'Cancelar', style: 'cancel' },
    ])
  }

  function confirmarSalir() {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => cerrarSesion() },
    ])
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (cargando) {
    return (
      <View style={st.pantallaCarga}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={st.cargandoTxt}>Cargando tu ruta…</Text>
      </View>
    )
  }

  const entregadas    = paradas.filter((p) => p.estado === 'entregado').length
  const fallidas      = paradas.filter((p) => p.estado === 'fallido').length
  const rechazadas    = paradas.filter((p) => p.estado === 'rechazado').length
  const total         = paradas.length
  const cerradas      = entregadas + fallidas + rechazadas
  const todasCerradas = total > 0 && cerradas === total
  const pct           = total > 0 ? Math.round((entregadas / total) * 100) : 0

  return (
    <View style={st.pagina}>
      {/* ══ HEADER ══ */}
      <View style={[st.header, { paddingTop: insets.top + 14 }]}>
        <View style={{ flex: 1 }}>
          <Text style={st.saludo}>{saludo()},</Text>
          <Text style={st.nombre} numberOfLines={1}>
            {conductor?.nombre?.split(' ')[0] ?? 'Conductor'}
          </Text>
          <Text style={st.fecha}>
            {fechaDisplayVzla({ weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
        </View>
        <View style={st.headerDer}>
          {ruta?.estado === 'en_ruta' && (
            <View style={[st.gpsChip, !gpsActivo && st.gpsChipOff]}>
              <Ionicons name={gpsActivo ? 'radio' : 'cloud-offline'} size={13} color={gpsActivo ? '#34D399' : '#FCA5A5'} />
              <Text style={[st.gpsTxt, !gpsActivo && st.gpsTxtOff]}>{gpsActivo ? 'GPS activo' : 'Sin GPS'}</Text>
            </View>
          )}
          <TouchableOpacity style={st.iconBtn} onPress={confirmarSalir} hitSlop={8}>
            <Ionicons name="log-out-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={st.scroll}
        contentContainerStyle={[st.contenido, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refresco} onRefresh={onRefrescar} tintColor={colors.primary} />}
      >
        {/* ══ ERROR ══ */}
        {error ? (
          <View style={st.errorBox}>
            <Ionicons name="warning" size={18} color={colors.danger} />
            <Text style={st.errorTxt}>{error}</Text>
          </View>
        ) : null}

        {/* ══ SIN RUTA ══ */}
        {!ruta ? (
          <View style={st.emptyCard}>
            <View style={st.emptyIcon}>
              <Ionicons name="clipboard-outline" size={32} color={colors.primary} />
            </View>
            <Text style={st.emptyTit}>Sin ruta asignada</Text>
            <Text style={st.emptyNota}>El despachador aún no te asignó una ruta para hoy.</Text>
            <TouchableOpacity style={st.btnOutline} onPress={onRefrescar} activeOpacity={0.85}>
              <Ionicons name="refresh" size={16} color={colors.primary} />
              <Text style={st.btnOutlineTxt}>Actualizar</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ══ MÉTRICAS ══ */}
        {ruta && (ruta.estado === 'en_ruta' || ruta.estado === 'completada') ? (
          <View style={st.metricas}>
            <StatCard icon="layers-outline"      num={total}            label="Total"      color={colors.slate} />
            <StatCard icon="checkmark-done"       num={entregadas}       label="Entregadas" color={colors.success} />
            <StatCard icon="time-outline"         num={total - cerradas} label="Pendientes" color={colors.warning} />
            <StatCard icon="close-circle-outline" num={fallidas}         label="Fallidas"   color={colors.danger} />
          </View>
        ) : null}

        {/* ══ RUTA PENDIENTE ══ */}
        {ruta?.estado === 'pendiente' ? (
          <View style={st.card}>
            <View style={st.rowCenter}>
              <View style={st.bigIcon}>
                <MaterialCommunityIcons name="truck-fast-outline" size={26} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.cardEtiqueta}>Ruta asignada para hoy</Text>
                <Text style={st.cardBig}>{total} paradas listas</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[st.btnPrimario, accionando === 'iniciar' && st.btnOff]}
              onPress={onIniciarRuta}
              disabled={!!accionando}
              activeOpacity={0.85}
            >
              {accionando === 'iniciar'
                ? <ActivityIndicator color="#fff" />
                : (<><Ionicons name="play" size={18} color="#fff" /><Text style={st.btnPrimarioTxt}>Iniciar ruta</Text></>)}
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ══ PROGRESO (en_ruta) ══ */}
        {ruta?.estado === 'en_ruta' ? (
          <View style={st.card}>
            <View style={st.rowBetween}>
              <Text style={st.cardEtiqueta}>Progreso de entregas</Text>
              <Text style={st.pct}>{pct}%</Text>
            </View>
            {ruta.ts_inicio ? (
              <Text style={st.inicioTxt}>
                Iniciaste a las {new Date(ruta.ts_inicio).toLocaleTimeString('es-VE', {
                  hour: '2-digit', minute: '2-digit', timeZone: 'America/Caracas',
                })}
              </Text>
            ) : null}
            <View style={st.barraBg}>
              <View style={[st.barraFill, { width: `${pct}%` }]} />
            </View>
            <Text style={st.progresoSub}>{cerradas} de {total} paradas cerradas</Text>
            {todasCerradas ? (
              <TouchableOpacity
                style={[st.btnVerde, accionando === 'completar' && st.btnOff]}
                onPress={onCompletarRuta}
                disabled={!!accionando}
                activeOpacity={0.85}
              >
                {accionando === 'completar'
                  ? <ActivityIndicator color="#fff" />
                  : (<><Ionicons name="flag" size={18} color="#fff" /><Text style={st.btnPrimarioTxt}>Finalizar jornada</Text></>)}
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* ══ COMPLETADA ══ */}
        {ruta?.estado === 'completada' ? (
          <View style={[st.card, st.cardOk]}>
            <View style={st.okIcon}>
              <Ionicons name="checkmark-done-circle" size={40} color={colors.success} />
            </View>
            <Text style={st.okTit}>¡Jornada completada!</Text>
            <Text style={st.okSub}>{entregadas} de {total} entregas exitosas</Text>
            <TouchableOpacity
              style={[st.btnPrimario, { marginTop: 18, alignSelf: 'stretch' }, accionando === 'siguiente' && st.btnOff]}
              onPress={onCargarSiguienteRuta}
              disabled={accionando === 'siguiente'}
              activeOpacity={0.85}
            >
              {accionando === 'siguiente'
                ? <ActivityIndicator color="#fff" />
                : (<><Ionicons name="albums-outline" size={18} color="#fff" /><Text style={st.btnPrimarioTxt}>Cargar siguiente ruta</Text></>)}
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ══ LISTA DE PARADAS ══ */}
        {ruta && paradas.length > 0 ? (
          <>
            <View style={st.seccionHeader}>
              <Text style={st.seccionTit}>PARADAS</Text>
              <View style={st.seccionCount}><Text style={st.seccionCountTxt}>{total}</Text></View>
            </View>

            {paradas.map((parada, idx) => {
              const cliente   = parada.clientes
              const meta      = ESTADO[parada.estado] ?? ESTADO.pendiente
              const tipoPar   = TIPO_PARADA[parada.tipo_parada] ?? TIPO_PARADA.entrega
              const enProceso = accionando === parada.id
              const activa    = ruta.estado === 'en_ruta'
              const tieneUbic = !!(cliente?.lat && cliente?.lng)

              return (
                <View key={parada.id} style={[st.paradaCard, { borderLeftColor: meta.acento }]}>
                  <View style={st.paradaFila}>
                    <View style={[st.numCircle, { backgroundColor: meta.bg }]}>
                      <Text style={[st.numTxt, { color: meta.fg }]}>{idx + 1}</Text>
                    </View>

                    <View style={st.paradaInfo}>
                      <Text style={st.paradaNombre} numberOfLines={2}>{cliente?.nombre ?? '—'}</Text>
                      {cliente?.direccion ? (
                        <View style={st.dirRow}>
                          <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                          <Text style={st.paradaDireccion} numberOfLines={2}>{cliente.direccion}</Text>
                        </View>
                      ) : null}

                      <View style={st.badgeFila}>
                        <View style={[st.estadoBadge, { backgroundColor: meta.bg }]}>
                          <Ionicons name={meta.icon} size={12} color={meta.fg} />
                          <Text style={[st.estadoBadgeTxt, { color: meta.fg }]}>{meta.label}</Text>
                        </View>
                        <View style={[st.tipoBadge, { borderColor: tipoPar.color + '40', backgroundColor: tipoPar.color + '12' }]}>
                          <Ionicons name={tipoPar.icon} size={12} color={tipoPar.color} />
                          <Text style={[st.tipoBadgeTxt, { color: tipoPar.color }]}>{tipoPar.label}</Text>
                        </View>
                        {cliente?.pedido_kg > 0 ? (
                          <View style={st.tagChip}><Text style={st.tagTxt}>{cliente.pedido_kg} kg</Text></View>
                        ) : null}
                        {cliente?.zona ? (
                          <View style={st.tagChip}><Text style={st.tagTxt}>{cliente.zona}</Text></View>
                        ) : null}
                      </View>

                      {parada.estado === 'en_sitio' && tiemposEnSitio[parada.id] != null ? (
                        <View style={st.timerRow}>
                          <Ionicons name="timer-outline" size={13} color={colors.primary} />
                          <Text style={st.timerTxt}>{formatearTiempo(tiemposEnSitio[parada.id])} en sitio</Text>
                        </View>
                      ) : null}

                      {(parada.estado === 'entregado' || parada.estado === 'fallido') &&
                        parada.ts_llegada && parada.ts_completada ? (
                        <Text style={st.duracionTxt}>
                          Servicio: {formatearTiempo(Math.round((new Date(parada.ts_completada) - new Date(parada.ts_llegada)) / 1000))}
                        </Text>
                      ) : null}
                    </View>

                    <TouchableOpacity
                      style={[st.btnNavegar, !tieneUbic && st.btnNavegarOff]}
                      onPress={() => abrirNavegacion(cliente?.lat, cliente?.lng, cliente?.nombre ?? 'cliente')}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="navigate" size={18} color={tieneUbic ? colors.primary : colors.textMuted} />
                      <Text style={[st.btnNavegarTxt, !tieneUbic && { color: colors.textMuted }]}>Ir</Text>
                    </TouchableOpacity>
                  </View>

                  {/* acción: pendiente → llegué */}
                  {activa && parada.estado === 'pendiente' ? (
                    <TouchableOpacity
                      style={[st.btnAccion, st.btnLlegue, enProceso && st.btnOff]}
                      onPress={() => onMarcarParada(parada, 'en_sitio')}
                      disabled={!!accionando}
                      activeOpacity={0.85}
                    >
                      {enProceso
                        ? <ActivityIndicator color="#fff" size="small" />
                        : (<><Ionicons name="location" size={16} color="#fff" /><Text style={st.btnAccionTxt}>Llegué al sitio</Text></>)}
                    </TouchableOpacity>
                  ) : null}

                  {/* acciones: en sitio → entregado / fallido / rechazado */}
                  {activa && parada.estado === 'en_sitio' ? (
                    <View style={{ gap: 8, marginTop: 10 }}>
                      <View style={st.btnsEntrega}>
                        <TouchableOpacity
                          style={[st.btnAccion, st.btnEntregado, st.btnMitad, enProceso && st.btnOff]}
                          onPress={() => onMarcarParada(parada, 'entregado')}
                          disabled={!!accionando}
                          activeOpacity={0.85}
                        >
                          {enProceso
                            ? <ActivityIndicator color="#fff" size="small" />
                            : (<><Ionicons name="checkmark-circle" size={16} color="#fff" /><Text style={st.btnAccionTxt}>Entregado</Text></>)}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[st.btnAccion, st.btnFallido, st.btnMitad, enProceso && st.btnOff]}
                          onPress={() => onMarcarParada(parada, 'fallido')}
                          disabled={!!accionando}
                          activeOpacity={0.85}
                        >
                          {enProceso
                            ? <ActivityIndicator color="#fff" size="small" />
                            : (<><Ionicons name="close-circle" size={16} color="#fff" /><Text style={st.btnAccionTxt}>No entregado</Text></>)}
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity
                        style={[st.btnAccion, { backgroundColor: colors.orange }, enProceso && st.btnOff]}
                        onPress={() => onMarcarRechazado(parada)}
                        disabled={!!accionando}
                        activeOpacity={0.85}
                      >
                        {enProceso
                          ? <ActivityIndicator color="#fff" size="small" />
                          : (<><Ionicons name="hand-left" size={16} color="#fff" /><Text style={st.btnAccionTxt}>Cliente rechazó el pedido</Text></>)}
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              )
            })}
          </>
        ) : null}

        {ruta ? (
          <TouchableOpacity style={st.cierreBtn} onPress={() => navigation.navigate('CierreJornada')} activeOpacity={0.85}>
            <Ionicons name="clipboard-outline" size={16} color={colors.textSoft} />
            <Text style={st.cierreTxt}>Cerrar jornada</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      <FirmaModal
        visible={firmaVisible}
        clienteNombre={firmaCliente}
        onConfirmar={(base64) => cerrarFirma(base64)}
        onCancelar={() => cerrarFirma(null)}
      />
    </View>
  )
}

const st = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  contenido: { padding: 16, paddingTop: 18 },

  pantallaCarga: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg, gap: 12 },
  cargandoTxt: { color: colors.textSoft, fontSize: 14, fontWeight: '600' },

  // Header
  header: {
    backgroundColor: colors.text,
    paddingHorizontal: 20, paddingBottom: 18,
    flexDirection: 'row', alignItems: 'flex-start',
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },
  saludo: { color: '#94A3B8', fontSize: 13, fontWeight: '500' },
  nombre: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 1 },
  fecha:  { color: '#CBD5E1', fontSize: 12.5, marginTop: 3, textTransform: 'capitalize' },
  headerDer: { alignItems: 'flex-end', gap: 8 },
  gpsChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(52,211,153,0.16)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full,
  },
  gpsChipOff: { backgroundColor: 'rgba(248,113,113,0.16)' },
  gpsTxt: { color: '#34D399', fontSize: 11.5, fontWeight: '700' },
  gpsTxtOff: { color: '#FCA5A5' },
  iconBtn: {
    width: 38, height: 38, borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },

  // Error
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.dangerBg, borderRadius: radius.md, padding: 12, marginBottom: 14,
    borderLeftWidth: 4, borderLeftColor: colors.danger,
  },
  errorTxt: { flex: 1, color: '#991B1B', fontSize: 13, fontWeight: '500' },

  // Empty
  emptyCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 32, alignItems: 'center',
    marginTop: 8, ...shadow(3),
  },
  emptyIcon: {
    width: 64, height: 64, borderRadius: radius.full, backgroundColor: colors.primarySoft,
    justifyContent: 'center', alignItems: 'center', marginBottom: 14,
  },
  emptyTit: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 6 },
  emptyNota: { fontSize: 13.5, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 18 },
  btnOutline: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.full,
    paddingHorizontal: 22, paddingVertical: 11,
  },
  btnOutlineTxt: { color: colors.primary, fontWeight: '700', fontSize: 14 },

  // Métricas
  metricas: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    paddingVertical: 14, paddingHorizontal: 6, alignItems: 'center', ...shadow(2),
  },
  statIcon: {
    width: 34, height: 34, borderRadius: radius.full,
    justifyContent: 'center', alignItems: 'center', marginBottom: 7,
  },
  statNum: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 10.5, color: colors.textMuted, fontWeight: '600', marginTop: 1 },

  // Card genérica
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18, marginBottom: 14, ...shadow(3) },
  cardEtiqueta: { fontSize: 12, fontWeight: '700', color: colors.textSoft, textTransform: 'uppercase', letterSpacing: 0.4 },
  cardBig: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 2 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bigIcon: {
    width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.primarySoft,
    justifyContent: 'center', alignItems: 'center',
  },

  pct: { fontSize: 26, fontWeight: '800', color: colors.primary },
  inicioTxt: { fontSize: 12.5, color: colors.textMuted, marginTop: 4, marginBottom: 12 },
  barraBg: { height: 12, backgroundColor: '#EEF2F7', borderRadius: radius.full, overflow: 'hidden', marginTop: 6 },
  barraFill: { height: 12, backgroundColor: colors.success, borderRadius: radius.full },
  progresoSub: { fontSize: 12.5, color: colors.textSoft, marginTop: 8, fontWeight: '600' },

  // Completada
  cardOk: { alignItems: 'center', backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0' },
  okIcon: { marginBottom: 6 },
  okTit: { fontSize: 20, fontWeight: '800', color: '#15803D' },
  okSub: { fontSize: 13.5, color: '#16A34A', marginTop: 3 },

  // Sección
  seccionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 10 },
  seccionTit: { fontSize: 12.5, fontWeight: '800', color: colors.textSoft, letterSpacing: 1 },
  seccionCount: { backgroundColor: colors.slate, borderRadius: radius.full, minWidth: 22, paddingHorizontal: 7, paddingVertical: 1, alignItems: 'center' },
  seccionCountTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // Parada
  paradaCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, marginBottom: 12,
    borderLeftWidth: 4, ...shadow(2),
  },
  paradaFila: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  numCircle: { width: 34, height: 34, borderRadius: radius.full, justifyContent: 'center', alignItems: 'center' },
  numTxt: { fontSize: 15, fontWeight: '800' },
  paradaInfo: { flex: 1, minWidth: 0 },
  paradaNombre: { fontSize: 15.5, fontWeight: '700', color: colors.text },
  dirRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 3 },
  paradaDireccion: { flex: 1, fontSize: 12.5, color: colors.textMuted, lineHeight: 17 },
  badgeFila: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  estadoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  estadoBadgeTxt: { fontSize: 11, fontWeight: '700' },
  tipoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  tipoBadgeTxt: { fontSize: 11, fontWeight: '700' },
  tagChip: { backgroundColor: colors.bg, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  tagTxt: { fontSize: 11, color: colors.textSoft, fontWeight: '600' },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  timerTxt: { fontSize: 12.5, color: colors.primary, fontWeight: '700' },
  duracionTxt: { fontSize: 11.5, color: colors.textMuted, marginTop: 6 },

  btnNavegar: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primarySoft, borderRadius: radius.md,
    paddingHorizontal: 12, paddingVertical: 8, gap: 1, minWidth: 52,
  },
  btnNavegarOff: { backgroundColor: colors.bg },
  btnNavegarTxt: { fontSize: 11, fontWeight: '700', color: colors.primary },

  // Botones de acción
  btnAccion: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderRadius: radius.full, paddingVertical: 14,
  },
  btnAccionTxt: { color: '#fff', fontWeight: '800', fontSize: 14.5 },
  btnLlegue: { backgroundColor: colors.primary, marginTop: 10 },
  btnEntregado: { backgroundColor: colors.success },
  btnFallido: { backgroundColor: colors.danger },
  btnsEntrega: { flexDirection: 'row', gap: 8 },
  btnMitad: { flex: 1 },

  btnPrimario: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: 16, paddingHorizontal: 28, ...shadow(5),
  },
  btnPrimarioTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  btnVerde: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.success, borderRadius: radius.full, paddingVertical: 16, marginTop: 16, ...shadow(5),
  },
  btnOff: { opacity: 0.55 },

  cierreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    marginTop: 18, paddingVertical: 13,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface,
  },
  cierreTxt: { color: colors.textSoft, fontWeight: '700', fontSize: 14 },
})


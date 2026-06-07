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
import { useAuth } from '../context/AuthContext'
import { fechaDisplayVzla } from '../lib/fecha'
import { registrarEvento } from '../lib/eventos'
import { detenerTracking, iniciarTracking } from '../lib/gps'
import { activarRuta, actualizarEstadoParada, cargarRutaHoy, completarRuta, cargarSiguienteRuta } from '../lib/ruta'
import { supabase } from '../lib/supabase'

// ─── colores por estado ────────────────────────────────────────────────────
const ESTADO = {
  pendiente:  { label: 'Pendiente',    borde: '#cbd5e1', badge: '#f1f5f9', badgeTxt: '#64748b', acento: '#94a3b8', icono: '○' },
  en_sitio:   { label: 'En sitio',     borde: '#3b82f6', badge: '#dbeafe', badgeTxt: '#0284C7', acento: '#3b82f6', icono: '●' },
  entregado:  { label: 'Entregado',    borde: '#22c55e', badge: '#dcfce7', badgeTxt: '#15803d', acento: '#22c55e', icono: '✓' },
  fallido:    { label: 'No entregado', borde: '#ef4444', badge: '#fee2e2', badgeTxt: '#b91c1c', acento: '#ef4444', icono: '✕' },
  rechazado:  { label: 'Rechazado',    borde: '#f97316', badge: '#ffedd5', badgeTxt: '#c2410c', acento: '#f97316', icono: '🚫' },
}

// ─── tipo parada ─────────────────────────────────────────────────────────────
const TIPO_PARADA = {
  entrega:          { label: 'Entrega',   icono: '📦', color: '#0284C7' },
  recogida:         { label: 'Recogida',  icono: '📤', color: '#7c3aed' },
  entrega_recogida: { label: 'E + R',     icono: '🔄', color: '#0891b2' },
  servicio:         { label: 'Servicio',  icono: '🔧', color: '#d97706' },
}

function formatearTiempo(seg) {
  const m = Math.floor(seg / 60)
  const s = seg % 60
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function saludo() {
  const h = new Date().getHours()
  if (h >= 5  && h < 12) return 'Buenos días'
  if (h >= 12 && h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export default function RutaScreen({ navigation }) {
  const { conductor, cerrarSesion } = useAuth()
  const [ruta, setRuta]             = useState(null)
  const [paradas, setParadas]       = useState([])
  const [cargando, setCargando]     = useState(true)
  const [refresco, setRefresco]     = useState(false)
  const [error, setError]           = useState(null)
  const [accionando, setAccionando] = useState(null)
  const [gpsActivo, setGpsActivo]   = useState(false)
  const [tiemposEnSitio, setTiemposEnSitio] = useState({})
  const trackingRef  = useRef(null)
  const accionandoRef = useRef(null)
  const rutaIdRef    = useRef(null)

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
          // Si solo se concedió "mientras uso la app", el despacho deja de verte
          // al bloquear el teléfono o cambiar de app. Guiar a "Permitir todo el
          // tiempo" en Ajustes (en Android 11+ no se puede conceder desde el cuadro).
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
    accionandoRef.current = parada.id
    setAccionando(parada.id)
    setError(null)
    try {
      await actualizarEstadoParada(parada.id, nuevoEstado)
      const tipo = nuevoEstado === 'en_sitio' ? 'llegada_parada' : `parada_${nuevoEstado}`
      await registrarEvento(tipo, { cliente: parada.clientes?.nombre }, {
        conductorId: conductor.id, rutaId: ruta.id, paradaId: parada.id,
      })
      setParadas((prev) => prev.map((p) => p.id === parada.id ? { ...p, estado: nuevoEstado } : p))
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

  async function onMarcarRechazado(paradaId) {
    if (accionandoRef.current) return
    accionandoRef.current = paradaId
    setAccionando(paradaId)
    setError(null)
    try {
      await actualizarEstadoParada(paradaId, 'rechazado')
      await registrarEvento('parada_rechazada', { paradaId }, { conductorId: conductor?.id, rutaId: ruta?.id, paradaId })
      await recargarParadas()
    } catch (e) { setError(e?.message ?? String(e)) }
    finally { accionandoRef.current = null; setAccionando(null) }
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

  // ── Loading ───────────────────────────────────────────────────────────────
  if (cargando) {
    return (
      <View style={s.pantallaCarga}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={s.cargandoTxt}>Cargando ruta…</Text>
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
    <ScrollView
      style={s.pagina}
      contentContainerStyle={s.contenido}
      refreshControl={<RefreshControl refreshing={refresco} onRefresh={onRefrescar} tintColor="#2563eb" />}
    >
      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <View style={s.header}>
        <View style={s.headerIzq}>
          <Text style={s.saludoTxt}>{saludo()},</Text>
          <Text style={s.nombreTxt}>
            {conductor?.nombre?.split(' ')[0] ?? 'Conductor'}
          </Text>
          <Text style={s.fecha}>
            {fechaDisplayVzla({ weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
        </View>
        <View style={s.headerDer}>
          {ruta?.estado === 'en_ruta' && (
            <View style={[s.gpsChip, !gpsActivo && s.gpsChipOff]}>
              <View style={[s.gpsDot, !gpsActivo && s.gpsDotOff]} />
              <Text style={[s.gpsTxt, !gpsActivo && s.gpsTxtOff]}>
                {gpsActivo ? 'GPS' : 'Sin GPS'}
              </Text>
            </View>
          )}
          {__DEV__ && (
            <TouchableOpacity style={s.btnConfig} onPress={() => navigation.navigate('Debug')}>
              <Text style={s.btnConfigTxt}>⚙</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      {/* Curva inferior del header */}
      <View style={s.headerCurva} />

      {/* ══ ERROR ════════════════════════════════════════════════════════════ */}
      {error ? (
        <View style={s.errorBox}>
          <Text style={s.errorTxt}>⚠️  {error}</Text>
        </View>
      ) : null}

      {/* ══ SIN RUTA ═════════════════════════════════════════════════════════ */}
      {!ruta ? (
        <View style={s.sinRutaCard}>
          <Text style={s.sinRutaIcono}>📋</Text>
          <Text style={s.sinRutaTit}>Sin ruta asignada</Text>
          <Text style={s.sinRutaNota}>El despachador aún no te asignó una ruta para hoy.</Text>
          <TouchableOpacity style={s.btnOutline} onPress={onRefrescar}>
            <Text style={s.btnOutlineTxt}>↻  Actualizar</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ══ MÉTRICAS (en_ruta / completada) ══════════════════════════════════ */}
      {ruta && (ruta.estado === 'en_ruta' || ruta.estado === 'completada') ? (
        <View style={s.metricas}>
          <MetricaCard num={total}          label="Total"      color="#475569" />
          <MetricaCard num={entregadas}     label="Entregadas" color="#16a34a" />
          <MetricaCard num={total - cerradas} label="Pendientes" color="#d97706" />
          <MetricaCard num={fallidas}       label="Fallidas"   color="#dc2626" />
        </View>
      ) : null}

      {/* ══ RUTA PENDIENTE ═══════════════════════════════════════════════════ */}
      {ruta?.estado === 'pendiente' ? (
        <View style={s.card}>
          <View style={s.rutaPendienteTop}>
            <Text style={s.rutaPendienteIcono}>🚚</Text>
            <View>
              <Text style={s.cardEtiqueta}>Ruta asignada para hoy</Text>
              <Text style={s.pendienteTxt}>{total} paradas listas</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[s.btnPrimario, accionando === 'iniciar' && s.btnOff]}
            onPress={onIniciarRuta}
            disabled={!!accionando}
            activeOpacity={0.85}
          >
            {accionando === 'iniciar'
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnPrimarioTxt}>Iniciar ruta</Text>}
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ══ BARRA PROGRESO (en_ruta) ══════════════════════════════════════════ */}
      {ruta?.estado === 'en_ruta' ? (
        <View style={s.card}>
          <View style={s.progresoHeader}>
            <Text style={s.cardEtiqueta}>Progreso de entregas</Text>
            <Text style={s.pctLabel}>{pct}%</Text>
          </View>
          {ruta.ts_inicio ? (
            <Text style={s.inicioTxt}>
              Iniciaste a las {new Date(ruta.ts_inicio).toLocaleTimeString('es-VE', {
                hour: '2-digit', minute: '2-digit', timeZone: 'America/Caracas',
              })}
            </Text>
          ) : null}
          <View style={s.barraBg}>
            <View style={[s.barraFill, { width: `${pct}%` }]} />
          </View>
          <Text style={s.progresoSub}>{entregadas} de {total} paradas cerradas</Text>
          {todasCerradas ? (
            <TouchableOpacity
              style={[s.btnVerde, accionando === 'completar' && s.btnOff]}
              onPress={onCompletarRuta}
              disabled={!!accionando}
              activeOpacity={0.85}
            >
              {accionando === 'completar'
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnPrimarioTxt}>✅  Finalizar jornada</Text>}
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* ══ JORNADA COMPLETADA ═══════════════════════════════════════════════ */}
      {ruta?.estado === 'completada' ? (
        <View style={[s.card, s.cardCompletada]}>
          <Text style={s.completadaIcono}>🎉</Text>
          <Text style={s.completadaTit}>¡Jornada completada!</Text>
          <Text style={s.completadaSub}>{entregadas} de {total} entregas exitosas</Text>
          <TouchableOpacity
            style={[s.btnAccion, { backgroundColor: '#0284c7', marginTop: 16 }]}
            onPress={onCargarSiguienteRuta}
            disabled={accionando === 'siguiente'}
          >
            {accionando === 'siguiente'
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.btnAccionTxt}>📋 Cargar siguiente ruta del día</Text>}
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ══ LISTA DE PARADAS ═════════════════════════════════════════════════ */}
      {ruta && paradas.length > 0 ? (
        <>
          <View style={s.seccionHeader}>
            <Text style={s.seccionTit}>PARADAS</Text>
            <Text style={s.seccionCount}>{total}</Text>
          </View>

          {paradas.map((parada, idx) => {
            const cliente   = parada.clientes
            const meta      = ESTADO[parada.estado] ?? ESTADO.pendiente
            const tipoPar   = TIPO_PARADA[parada.tipo_parada] ?? TIPO_PARADA.entrega
            const enProceso = accionando === parada.id
            const activa    = ruta.estado === 'en_ruta'
            const tieneUbic = !!(cliente?.lat && cliente?.lng)

            return (
              <View key={parada.id} style={[s.paradaCard, { borderLeftColor: meta.acento }]}>

                {/* fila superior: número + cliente + navegar */}
                <View style={s.paradaFila}>
                  {/* número */}
                  <View style={[s.numCircle, { backgroundColor: meta.badge }]}>
                    <Text style={[s.numTxt, { color: meta.badgeTxt }]}>{idx + 1}</Text>
                  </View>

                  {/* datos cliente */}
                  <View style={s.paradaInfo}>
                    <Text style={s.paradaNombre}>{cliente?.nombre ?? '—'}</Text>
                    {cliente?.direccion ? (
                      <Text style={s.paradaDireccion} numberOfLines={2}>{cliente.direccion}</Text>
                    ) : null}

                    {/* badges */}
                    <View style={s.badgeFila}>
                      {/* estado */}
                      <View style={[s.estadoBadge, { backgroundColor: meta.badge }]}>
                        <Text style={[s.estadoBadgeTxt, { color: meta.badgeTxt }]}>
                          {meta.icono}  {meta.label}
                        </Text>
                      </View>

                      {/* tipo parada */}
                      <View style={[s.tipoBadge, { borderColor: tipoPar.color + '40', backgroundColor: tipoPar.color + '12' }]}>
                        <Text style={[s.tipoBadgeTxt, { color: tipoPar.color }]}>
                          {tipoPar.icono} {tipoPar.label}
                        </Text>
                      </View>

                      {cliente?.pedido_kg > 0
                        ? <View style={s.tagChip}><Text style={s.tagTxt}>{cliente.pedido_kg} kg</Text></View>
                        : null}
                      {cliente?.zona
                        ? <View style={s.tagChip}><Text style={s.tagTxt}>{cliente.zona}</Text></View>
                        : null}
                    </View>

                    {/* timer en sitio */}
                    {parada.estado === 'en_sitio' && tiemposEnSitio[parada.id] != null ? (
                      <Text style={s.timerTxt}>⏱  {formatearTiempo(tiemposEnSitio[parada.id])} en sitio</Text>
                    ) : null}

                    {/* duración servicio completado */}
                    {(parada.estado === 'entregado' || parada.estado === 'fallido') &&
                      parada.ts_llegada && parada.ts_completada ? (
                      <Text style={s.duracionTxt}>
                        Servicio: {formatearTiempo(Math.round(
                          (new Date(parada.ts_completada) - new Date(parada.ts_llegada)) / 1000
                        ))}
                      </Text>
                    ) : null}
                  </View>

                  {/* botón navegar */}
                  <TouchableOpacity
                    style={[s.btnNavegar, !tieneUbic && s.btnNavegarOff]}
                    onPress={() => abrirNavegacion(cliente?.lat, cliente?.lng, cliente?.nombre ?? 'cliente')}
                    activeOpacity={0.8}
                  >
                    <Text style={s.btnNavegarIcono}>🗺</Text>
                    <Text style={[s.btnNavegarTxt, !tieneUbic && { color: '#94a3b8' }]}>
                      Ir
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* acción: pendiente → llegué */}
                {activa && parada.estado === 'pendiente' ? (
                  <TouchableOpacity
                    style={[s.btnAccion, s.btnLlegue, enProceso && s.btnOff]}
                    onPress={() => onMarcarParada(parada, 'en_sitio')}
                    disabled={!!accionando}
                    activeOpacity={0.85}
                  >
                    {enProceso
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={s.btnAccionTxt}>📍  Llegué al sitio</Text>}
                  </TouchableOpacity>
                ) : null}

                {/* acciones: en sitio → entregado / fallido / rechazado */}
                {activa && parada.estado === 'en_sitio' ? (
                  <View>
                    <View style={s.btnsEntrega}>
                      <TouchableOpacity
                        style={[s.btnAccion, s.btnEntregado, s.btnMitad, enProceso && s.btnOff]}
                        onPress={() => onMarcarParada(parada, 'entregado')}
                        disabled={!!accionando}
                        activeOpacity={0.85}
                      >
                        {enProceso
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={s.btnAccionTxt}>✅  Entregado</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.btnAccion, s.btnFallido, s.btnMitad, enProceso && s.btnOff]}
                        onPress={() => onMarcarParada(parada, 'fallido')}
                        disabled={!!accionando}
                        activeOpacity={0.85}
                      >
                        {enProceso
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={s.btnAccionTxt}>✕  No entregado</Text>}
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      style={[s.btnAccion, { backgroundColor: '#f97316' }, enProceso && s.btnOff]}
                      onPress={() => onMarcarRechazado(parada.id)}
                      disabled={!!accionando}
                      activeOpacity={0.85}
                    >
                      {enProceso
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={s.btnAccionTxt}>🚫  Cliente rechazó el pedido</Text>}
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            )
          })}
        </>
      ) : null}

      {/* ══ FOOTER ═══════════════════════════════════════════════════════════ */}
      <TouchableOpacity style={s.btnCerrarSesion} onPress={cerrarSesion}>
        <Text style={s.btnCerrarSesionTxt}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

// ─── Componente métrica ────────────────────────────────────────────────────
function MetricaCard({ num, label, color }) {
  return (
    <View style={[s.metricaCard, { borderTopColor: color }]}>
      <Text style={[s.metricaNum, { color }]}>{num}</Text>
      <Text style={s.metricaLabel}>{label}</Text>
    </View>
  )
}

// ─── estilos ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  pagina:        { flex: 1, backgroundColor: '#F4F7FB' },
  contenido:     { paddingBottom: 48 },
  pantallaCarga: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F7FB' },
  cargandoTxt:   { marginTop: 12, color: '#64748b', fontSize: 14 },

  // ── Header ──
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    backgroundColor: '#0F172A',
    paddingHorizontal: 20, paddingTop: 22, paddingBottom: 28,
  },
  headerCurva: {
    height: 22,
    backgroundColor: '#0F172A',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    marginTop: -1,
  },
  headerIzq:  { flex: 1 },
  headerDer:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  saludoTxt:  { fontSize: 13, color: '#93c5fd', fontWeight: '600', letterSpacing: 0.3 },
  nombreTxt:  { fontSize: 26, fontWeight: '800', color: '#f1f5f9', marginTop: 1 },
  fecha:      { fontSize: 12, color: '#7dd3fc', marginTop: 4, textTransform: 'capitalize' },

  gpsChip:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(5,150,105,0.18)', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20 },
  gpsChipOff: { backgroundColor: 'rgba(220,38,38,0.15)' },
  gpsDot:     { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ade80' },
  gpsDotOff:  { backgroundColor: '#f87171' },
  gpsTxt:     { fontSize: 11, fontWeight: '700', color: '#4ade80' },
  gpsTxtOff:  { color: '#f87171' },

  btnConfig:    { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10, width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  btnConfigTxt: { fontSize: 17, color: '#fff' },

  // ── Error ──
  errorBox: { margin: 16, backgroundColor: '#fef2f2', borderRadius: 12, padding: 14, borderLeftWidth: 4, borderLeftColor: '#ef4444' },
  errorTxt: { color: '#b91c1c', fontSize: 13 },

  // ── Sin ruta ──
  sinRutaCard: { margin: 16, backgroundColor: '#fff', borderRadius: 20, padding: 36, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 10, elevation: 3, marginTop: 24 },
  sinRutaIcono: { fontSize: 52, marginBottom: 14 },
  sinRutaTit:  { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  sinRutaNota: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 22, marginBottom: 24 },

  // ── Métricas ──
  metricas: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 20, marginBottom: 4 },
  metricaCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 12,
    alignItems: 'center', borderTopWidth: 3,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  metricaNum:   { fontSize: 26, fontWeight: '900', marginBottom: 2 },
  metricaLabel: { fontSize: 9, color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'center' },

  // ── Card genérico ──
  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 18,
    marginHorizontal: 16, marginTop: 14,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
  },
  cardEtiqueta: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },

  rutaPendienteTop: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  rutaPendienteIcono: { fontSize: 38 },
  pendienteTxt: { fontSize: 20, fontWeight: '800', color: '#0f172a' },

  cardCompletada: { alignItems: 'center', paddingVertical: 36 },
  completadaIcono: { fontSize: 52, marginBottom: 12 },
  completadaTit: { fontSize: 22, fontWeight: '800', color: '#0f172a', marginBottom: 6 },
  completadaSub: { fontSize: 14, color: '#64748b' },

  // ── Progreso ──
  progresoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  pctLabel:    { fontSize: 24, fontWeight: '900', color: '#0284C7' },
  barraBg:     { height: 14, backgroundColor: '#f1f5f9', borderRadius: 7, overflow: 'hidden' },
  barraFill:   { height: 14, backgroundColor: '#22c55e', borderRadius: 7 },
  progresoSub: { fontSize: 12, color: '#94a3b8', marginTop: 6 },
  inicioTxt:   { fontSize: 11, color: '#94a3b8', marginBottom: 8 },

  // ── Sección paradas ──
  seccionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 24, marginBottom: 10 },
  seccionTit:    { fontSize: 11, fontWeight: '800', color: '#94a3b8', letterSpacing: 1.2 },
  seccionCount:  { fontSize: 11, fontWeight: '700', color: '#fff', backgroundColor: '#94a3b8', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 },

  // ── Parada card ──
  paradaCard: {
    backgroundColor: '#fff', borderRadius: 16,
    marginHorizontal: 16, marginBottom: 10,
    paddingTop: 14, paddingRight: 14, paddingBottom: 14, paddingLeft: 10,
    borderLeftWidth: 5,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  paradaFila:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  numCircle:    { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  numTxt:       { fontSize: 13, fontWeight: '900' },
  paradaInfo:   { flex: 1 },
  paradaNombre: { fontSize: 15, fontWeight: '700', color: '#0f172a', lineHeight: 21 },
  paradaDireccion: { fontSize: 12, color: '#64748b', marginTop: 2, lineHeight: 17 },

  badgeFila:     { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  estadoBadge:   { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  estadoBadgeTxt:{ fontSize: 11, fontWeight: '700' },
  tipoBadge:     { borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  tipoBadgeTxt:  { fontSize: 11, fontWeight: '700' },
  tagChip:       { backgroundColor: '#f1f5f9', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  tagTxt:        { fontSize: 11, color: '#64748b', fontWeight: '600' },

  timerTxt:   { fontSize: 12, color: '#0284C7', fontWeight: '700', marginTop: 6 },
  duracionTxt:{ fontSize: 11, color: '#94a3b8', marginTop: 4 },

  // ── Botón navegar ──
  btnNavegar: {
    backgroundColor: '#0284C7', borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 10,
    alignItems: 'center', minWidth: 52,
    shadowColor: '#0369A1', shadowOpacity: 0.3, shadowRadius: 6, elevation: 3,
  },
  btnNavegarOff:   { backgroundColor: '#f1f5f9', shadowOpacity: 0 },
  btnNavegarIcono: { fontSize: 18 },
  btnNavegarTxt:   { fontSize: 10, fontWeight: '800', color: '#fff', marginTop: 3, letterSpacing: 0.2 },

  // ── Botones acción parada ──
  btnAccion:    { borderRadius: 12, paddingVertical: 15, paddingHorizontal: 12, alignItems: 'center', marginTop: 12 },
  btnAccionTxt: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.2 },
  btnLlegue:    { backgroundColor: '#0284C7', borderRadius: 100 },
  btnsEntrega:  { flexDirection: 'row', gap: 8, marginTop: 12 },
  btnMitad:     { flex: 1 },
  btnEntregado: { backgroundColor: '#059669', borderRadius: 100 },
  btnFallido:   { backgroundColor: '#DC2626', borderRadius: 100 },

  // ── Botones generales ──
  btnPrimario: { backgroundColor: '#0284C7', borderRadius: 100, padding: 17, alignItems: 'center', shadowColor: '#0284C7', shadowOpacity: 0.35, shadowRadius: 10, elevation: 5 },
  btnVerde:    { backgroundColor: '#059669', borderRadius: 100, padding: 17, alignItems: 'center', marginTop: 16, shadowColor: '#059669', shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 },
  btnPrimarioTxt: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.2 },
  btnOutline:    { borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 28, paddingVertical: 13 },
  btnOutlineTxt: { color: '#475569', fontWeight: '700', fontSize: 14 },
  btnOff: { opacity: 0.5 },

  // ── Footer ──
  btnCerrarSesion:    { alignItems: 'center', paddingVertical: 24, marginTop: 8 },
  btnCerrarSesionTxt: { color: '#94a3b8', fontSize: 13 },
})

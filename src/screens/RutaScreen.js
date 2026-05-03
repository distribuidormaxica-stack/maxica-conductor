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
import { activarRuta, actualizarEstadoParada, cargarRutaHoy, completarRuta } from '../lib/ruta'
import { supabase } from '../lib/supabase'

// ─── colores por estado ────────────────────────────────────────────────────
const ESTADO = {
  pendiente: { label: 'Pendiente',    borde: '#cbd5e1', badge: '#f1f5f9', badgeTxt: '#64748b', acento: '#94a3b8', icono: '○' },
  en_sitio:  { label: 'En sitio',     borde: '#3b82f6', badge: '#dbeafe', badgeTxt: '#1d4ed8', acento: '#3b82f6', icono: '●' },
  entregado: { label: 'Entregado',    borde: '#22c55e', badge: '#dcfce7', badgeTxt: '#15803d', acento: '#22c55e', icono: '✓' },
  fallido:   { label: 'No entregado', borde: '#ef4444', badge: '#fee2e2', badgeTxt: '#b91c1c', acento: '#ef4444', icono: '✕' },
}

function formatearTiempo(seg) {
  const m = Math.floor(seg / 60)
  const s = seg % 60
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`
  return `${m}m ${String(s).padStart(2, '0')}s`
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
  const accionandoRef = useRef(null) // ref para el callback de realtime
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

  useEffect(() => {
    setCargando(true)
    cargar().finally(() => setCargando(false))
  }, [cargar])

  // ── Realtime: detecta cambios de paradas hechos desde el panel ──────────
  useEffect(() => {
    if (!ruta?.id) return
    const canal = supabase
      .channel(`paradas-${ruta.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'paradas', filter: `ruta_id=eq.${ruta.id}` },
        () => {
          // Si el conductor está ejecutando una acción propia, esperar
          if (accionandoRef.current) return
          cargar()
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [ruta?.id, cargar])

  // Mantener ref sincronizado con estado
  useEffect(() => { accionandoRef.current = accionando }, [accionando])

  // ── GPS ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (ruta?.estado === 'en_ruta' && conductor) {
      iniciarTracking(conductor.id, ruta.id)
        .then((sub) => { trackingRef.current = sub; setGpsActivo(true) })
        .catch((e) => { console.warn('[GPS]', e?.message); setGpsActivo(false) })
    } else {
      detenerTracking(trackingRef.current)
      trackingRef.current = null
      setGpsActivo(false)
    }
    return () => { detenerTracking(trackingRef.current); trackingRef.current = null }
  }, [ruta?.estado, conductor])

  // ── Timers en sitio ──────────────────────────────────────────────────────
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

  // ── Acciones ─────────────────────────────────────────────────────────────
  async function onIniciarRuta() {
    if (!ruta) return
    setAccionando('iniciar')
    setError(null)
    try {
      await activarRuta(ruta.id)
      await registrarEvento('ruta_iniciada', {}, { conductorId: conductor.id, rutaId: ruta.id })
      setRuta((r) => ({ ...r, estado: 'en_ruta' }))
    } catch (e) { setError(e?.message ?? String(e)) }
    finally { setAccionando(null) }
  }

  async function onMarcarParada(parada, nuevoEstado) {
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
    finally { setAccionando(null) }
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
  const total         = paradas.length
  const cerradas      = entregadas + fallidas
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
          <Text style={s.saludo}>
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
                {gpsActivo ? 'GPS activo' : 'Sin GPS'}
              </Text>
            </View>
          )}
          <TouchableOpacity style={s.btnConfig} onPress={() => navigation.navigate('Debug')}>
            <Text style={s.btnConfigTxt}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

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
          <View style={[s.metricaCard, s.metricaTotal]}>
            <Text style={s.metricaNum}>{total}</Text>
            <Text style={s.metricaLabel}>Total</Text>
          </View>
          <View style={[s.metricaCard, s.metricaEntregada]}>
            <Text style={[s.metricaNum, { color: '#16a34a' }]}>{entregadas}</Text>
            <Text style={s.metricaLabel}>Entregas</Text>
          </View>
          <View style={[s.metricaCard, s.metricaPendiente]}>
            <Text style={[s.metricaNum, { color: '#f59e0b' }]}>{total - cerradas}</Text>
            <Text style={s.metricaLabel}>Pendientes</Text>
          </View>
          <View style={[s.metricaCard, s.metricaFallida]}>
            <Text style={[s.metricaNum, { color: '#ef4444' }]}>{fallidas}</Text>
            <Text style={s.metricaLabel}>Fallidas</Text>
          </View>
        </View>
      ) : null}

      {/* ══ RUTA PENDIENTE ═══════════════════════════════════════════════════ */}
      {ruta?.estado === 'pendiente' ? (
        <View style={s.card}>
          <Text style={s.cardEtiqueta}>Ruta asignada</Text>
          <Text style={s.pendienteTxt}>{total} paradas listas para iniciar</Text>
          <TouchableOpacity
            style={[s.btnPrimario, accionando === 'iniciar' && s.btnOff]}
            onPress={onIniciarRuta}
            disabled={!!accionando}
            activeOpacity={0.85}
          >
            {accionando === 'iniciar'
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnPrimarioTxt}>🚚  Iniciar ruta</Text>}
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ══ BARRA PROGRESO (en_ruta) ══════════════════════════════════════════ */}
      {ruta?.estado === 'en_ruta' ? (
        <View style={s.card}>
          <View style={s.progresoHeader}>
            <Text style={s.cardEtiqueta}>Progreso</Text>
            <Text style={s.pctLabel}>{pct}%</Text>
          </View>
          <View style={s.barraBg}>
            <View style={[s.barraFill, { width: `${pct}%` }]} />
          </View>
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
        </View>
      ) : null}

      {/* ══ LISTA DE PARADAS ═════════════════════════════════════════════════ */}
      {ruta && paradas.length > 0 ? (
        <>
          <Text style={s.seccionTit}>PARADAS · {total}</Text>
          {paradas.map((parada, idx) => {
            const cliente   = parada.clientes
            const meta      = ESTADO[parada.estado] ?? ESTADO.pendiente
            const enProceso = accionando === parada.id
            const activa    = ruta.estado === 'en_ruta'
            const tieneUbic = !!(cliente?.lat && cliente?.lng)

            return (
              <View key={parada.id} style={[s.paradaCard, { borderLeftColor: meta.acento }]}>

                {/* fila principal */}
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

                    {/* badges de estado y extras */}
                    <View style={s.badgeFila}>
                      <View style={[s.estadoBadge, { backgroundColor: meta.badge }]}>
                        <Text style={[s.estadoBadgeTxt, { color: meta.badgeTxt }]}>
                          {meta.icono}  {meta.label}
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
                      Navegar
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

                {/* acciones: en sitio → entregado / fallido */}
                {activa && parada.estado === 'en_sitio' ? (
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
                        : <Text style={s.btnAccionTxt}>❌  No entregado</Text>}
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

// ─── estilos ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  pagina:        { flex: 1, backgroundColor: '#f0f4f8' },
  contenido:     { paddingBottom: 48 },
  pantallaCarga: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f4f8' },
  cargandoTxt:   { marginTop: 12, color: '#64748b', fontSize: 14 },

  // ── Header ──
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    backgroundColor: '#1e3a5f',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24,
  },
  headerIzq: { flex: 1 },
  headerDer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  saludo:    { fontSize: 22, fontWeight: '800', color: '#f1f5f9' },
  fecha:     { fontSize: 13, color: '#93c5fd', marginTop: 3, textTransform: 'capitalize' },

  gpsChip:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#134e2a', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  gpsChipOff: { backgroundColor: '#4c1b1b' },
  gpsDot:     { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ade80' },
  gpsDotOff:  { backgroundColor: '#f87171' },
  gpsTxt:     { fontSize: 11, fontWeight: '700', color: '#4ade80' },
  gpsTxtOff:  { color: '#f87171' },

  btnConfig:    { backgroundColor: '#1e40af', borderRadius: 10, width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  btnConfigTxt: { fontSize: 17, color: '#fff' },

  // ── Error ──
  errorBox: { margin: 16, backgroundColor: '#fef2f2', borderRadius: 12, padding: 14, borderLeftWidth: 4, borderLeftColor: '#ef4444' },
  errorTxt: { color: '#b91c1c', fontSize: 13 },

  // ── Sin ruta ──
  sinRutaCard: { margin: 16, backgroundColor: '#fff', borderRadius: 16, padding: 32, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  sinRutaIcono: { fontSize: 48, marginBottom: 12 },
  sinRutaTit:  { fontSize: 17, fontWeight: '700', color: '#0f172a', marginBottom: 6 },
  sinRutaNota: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 22, marginBottom: 20 },

  // ── Métricas ──
  metricas: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 16, marginBottom: 4 },
  metricaCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  metricaTotal:     { borderTopWidth: 3, borderTopColor: '#64748b' },
  metricaEntregada: { borderTopWidth: 3, borderTopColor: '#22c55e' },
  metricaPendiente: { borderTopWidth: 3, borderTopColor: '#f59e0b' },
  metricaFallida:   { borderTopWidth: 3, borderTopColor: '#ef4444' },
  metricaNum:   { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  metricaLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', marginTop: 2 },

  // ── Card genérico ──
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18,
    marginHorizontal: 16, marginTop: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  cardEtiqueta: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  pendienteTxt: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 16 },

  cardCompletada: { alignItems: 'center', paddingVertical: 32 },
  completadaIcono: { fontSize: 48, marginBottom: 10 },
  completadaTit: { fontSize: 20, fontWeight: '800', color: '#0f172a', marginBottom: 6 },
  completadaSub: { fontSize: 14, color: '#64748b' },

  // ── Progreso ──
  progresoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  pctLabel:  { fontSize: 20, fontWeight: '800', color: '#2563eb' },
  barraBg:   { height: 12, backgroundColor: '#f1f5f9', borderRadius: 6, overflow: 'hidden', marginBottom: 4 },
  barraFill: { height: 12, backgroundColor: '#22c55e', borderRadius: 6 },

  // ── Sección paradas ──
  seccionTit: { fontSize: 11, fontWeight: '700', color: '#94a3b8', letterSpacing: 1, marginHorizontal: 16, marginTop: 20, marginBottom: 10 },

  // ── Parada card ──
  paradaCard: {
    backgroundColor: '#fff', borderRadius: 14,
    marginHorizontal: 16, marginBottom: 10,
    paddingTop: 14, paddingRight: 14, paddingBottom: 14, paddingLeft: 10,
    borderLeftWidth: 5,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  paradaFila:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  numCircle:    { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  numTxt:       { fontSize: 13, fontWeight: '800' },
  paradaInfo:   { flex: 1 },
  paradaNombre: { fontSize: 15, fontWeight: '700', color: '#0f172a', lineHeight: 21 },
  paradaDireccion: { fontSize: 12, color: '#64748b', marginTop: 2, lineHeight: 18 },

  badgeFila:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  estadoBadge:   { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  estadoBadgeTxt:{ fontSize: 11, fontWeight: '700' },
  tagChip:       { backgroundColor: '#f1f5f9', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  tagTxt:        { fontSize: 11, color: '#64748b', fontWeight: '600' },

  timerTxt:   { fontSize: 12, color: '#2563eb', fontWeight: '700', marginTop: 6 },
  duracionTxt:{ fontSize: 11, color: '#94a3b8', marginTop: 4 },

  // ── Botón navegar ──
  btnNavegar: {
    backgroundColor: '#1e40af', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
    alignItems: 'center', minWidth: 64,
    shadowColor: '#1e40af', shadowOpacity: 0.3, shadowRadius: 6, elevation: 3,
  },
  btnNavegarOff:   { backgroundColor: '#f1f5f9', shadowOpacity: 0 },
  btnNavegarIcono: { fontSize: 16 },
  btnNavegarTxt:   { fontSize: 10, fontWeight: '700', color: '#fff', marginTop: 3 },

  // ── Botones acción parada ──
  btnAccion:    { borderRadius: 10, padding: 13, alignItems: 'center', marginTop: 12 },
  btnAccionTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnLlegue:    { backgroundColor: '#2563eb' },
  btnsEntrega:  { flexDirection: 'row', gap: 8, marginTop: 12 },
  btnMitad:     { flex: 1 },
  btnEntregado: { backgroundColor: '#16a34a' },
  btnFallido:   { backgroundColor: '#ef4444' },

  // ── Botones generales ──
  btnPrimario: { backgroundColor: '#2563eb', borderRadius: 12, padding: 15, alignItems: 'center', shadowColor: '#2563eb', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  btnVerde:    { backgroundColor: '#16a34a', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 14, shadowColor: '#16a34a', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  btnPrimarioTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnOutline:    { borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 11 },
  btnOutlineTxt: { color: '#475569', fontWeight: '600', fontSize: 14 },
  btnOff: { opacity: 0.5 },

  // ── Footer ──
  btnCerrarSesion:    { alignItems: 'center', paddingVertical: 20, marginTop: 8 },
  btnCerrarSesionTxt: { color: '#94a3b8', fontSize: 13 },
})

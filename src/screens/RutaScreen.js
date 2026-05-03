import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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

const ANCHO = Dimensions.get('window').width - 48

const ESTADO = {
  pendiente: { label: 'Pendiente',    fondo: '#1e293b', borde: '#334155', texto: '#94a3b8', icono: '⏳' },
  en_sitio:  { label: 'En sitio',     fondo: '#1e3a5f', borde: '#2563eb', texto: '#93c5fd', icono: '📍' },
  entregado: { label: 'Entregado',    fondo: '#14352a', borde: '#16a34a', texto: '#86efac', icono: '✅' },
  fallido:   { label: 'No entregado', fondo: '#3b1111', borde: '#dc2626', texto: '#fca5a5', icono: '❌' },
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
  const trackingRef = useRef(null)

  const cargar = useCallback(async () => {
    if (!conductor) return
    setError(null)
    try {
      const datos = await cargarRutaHoy(conductor.id)
      setRuta(datos?.ruta ?? null)
      setParadas(datos?.paradas ?? [])
    } catch (e) {
      setError(e?.message ?? String(e))
    }
  }, [conductor])

  useEffect(() => {
    setCargando(true)
    cargar().finally(() => setCargando(false))
  }, [cargar])

  useEffect(() => {
    if (ruta?.estado === 'en_ruta' && conductor) {
      iniciarTracking(conductor.id, ruta.id)
        .then((sub) => { trackingRef.current = sub; setGpsActivo(true) })
        .catch((e) => { console.warn('[RutaScreen] GPS:', e?.message); setGpsActivo(false) })
    } else {
      detenerTracking(trackingRef.current)
      trackingRef.current = null
      setGpsActivo(false)
    }
    return () => {
      detenerTracking(trackingRef.current)
      trackingRef.current = null
    }
  }, [ruta?.estado, conductor])

  useEffect(() => {
    const enSitio = paradas.filter((p) => p.estado === 'en_sitio' && p.ts_llegada)
    if (enSitio.length === 0) return
    const interval = setInterval(() => {
      setTiemposEnSitio((prev) => {
        const nuevo = { ...prev }
        for (const p of enSitio) {
          nuevo[p.id] = Math.round((Date.now() - new Date(p.ts_llegada).getTime()) / 1000)
        }
        return nuevo
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [paradas])

  async function onIniciarRuta() {
    if (!ruta) return
    setAccionando('iniciar')
    setError(null)
    try {
      await activarRuta(ruta.id)
      await registrarEvento('ruta_iniciada', {}, { conductorId: conductor.id, rutaId: ruta.id })
      setRuta((r) => ({ ...r, estado: 'en_ruta' }))
    } catch (e) {
      setError(e?.message ?? String(e))
    } finally {
      setAccionando(null)
    }
  }

  async function onMarcarParada(parada, nuevoEstado) {
    setAccionando(parada.id)
    setError(null)
    try {
      await actualizarEstadoParada(parada.id, nuevoEstado)
      const tipo = nuevoEstado === 'en_sitio' ? 'llegada_parada' : `parada_${nuevoEstado}`
      await registrarEvento(
        tipo,
        { cliente: parada.clientes?.nombre },
        { conductorId: conductor.id, rutaId: ruta.id, paradaId: parada.id },
      )
      setParadas((prev) =>
        prev.map((p) => (p.id === parada.id ? { ...p, estado: nuevoEstado } : p)),
      )
    } catch (e) {
      setError(e?.message ?? String(e))
    } finally {
      setAccionando(null)
    }
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
    } catch (e) {
      setError(e?.message ?? String(e))
    } finally {
      setAccionando(null)
    }
  }

  function abrirNavegacion(lat, lng, nombre) {
    if (!lat || !lng) {
      Alert.alert('Sin coordenadas', 'Este cliente no tiene ubicación registrada.')
      return
    }
    Alert.alert(`Navegar a ${nombre}`, '¿Con qué app?', [
      {
        text: 'Google Maps',
        onPress: () =>
          Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`),
      },
      {
        text: 'Waze',
        onPress: () =>
          Linking.openURL(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`),
      },
      { text: 'Cancelar', style: 'cancel' },
    ])
  }

  if (cargando) {
    return (
      <View style={s.centro}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={s.cargandoTxt}>Cargando ruta…</Text>
      </View>
    )
  }

  const entregadas    = paradas.filter((p) => p.estado === 'entregado').length
  const total         = paradas.length
  const cerradas      = paradas.filter((p) => p.estado === 'entregado' || p.estado === 'fallido').length
  const todasCerradas = total > 0 && cerradas === total
  const pct           = total > 0 ? entregadas / total : 0
  const barraAncho    = Math.round(pct * ANCHO)

  return (
    <ScrollView
      style={s.pagina}
      contentContainerStyle={s.contenido}
      refreshControl={<RefreshControl refreshing={refresco} onRefresh={onRefrescar} tintColor="#2563eb" />}
    >
      {/* ── CABECERA ── */}
      <View style={s.cabecera}>
        <View style={s.cabeceraIzq}>
          <Text style={s.saludo}>
            Hola, {conductor?.nombre?.split(' ')[0] ?? 'conductor'} 👋
          </Text>
          <Text style={s.fechaTxt}>
            {fechaDisplayVzla({ weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
        </View>
        <View style={s.cabeceraDer}>
          {ruta?.estado === 'en_ruta' && (
            <View style={[s.gpsChip, !gpsActivo && s.gpsChipOff]}>
              <View style={[s.gpsPunto, !gpsActivo && s.gpsPuntoOff]} />
              <Text style={[s.gpsTxt, !gpsActivo && s.gpsTxtOff]}>
                {gpsActivo ? 'GPS' : 'Sin GPS'}
              </Text>
            </View>
          )}
          <TouchableOpacity style={s.btnDebug} onPress={() => navigation.navigate('Debug')}>
            <Text style={s.btnDebugTxt}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── ERROR ── */}
      {error ? (
        <View style={s.errorBox}>
          <Text style={s.errorTxt}>⚠️ {error}</Text>
        </View>
      ) : null}

      {/* ── SIN RUTA ── */}
      {!ruta ? (
        <View style={s.sinRuta}>
          <Text style={s.sinRutaIcono}>📋</Text>
          <Text style={s.sinRutaTit}>Sin ruta para hoy</Text>
          <Text style={s.sinRutaNota}>
            El despachador aún no te asignó una ruta. Vuelve a revisar más tarde.
          </Text>
          <TouchableOpacity style={s.btnSecundario} onPress={onRefrescar}>
            <Text style={s.btnSecundarioTxt}>Actualizar</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ── RUTA PENDIENTE ── */}
      {ruta?.estado === 'pendiente' ? (
        <View style={s.card}>
          <Text style={s.cardLabel}>Ruta asignada</Text>
          <Text style={s.resumenTxt}>{total} paradas pendientes</Text>
          <TouchableOpacity
            style={[s.btnPrimario, accionando === 'iniciar' && s.btnOff]}
            onPress={onIniciarRuta}
            disabled={!!accionando}
            activeOpacity={0.85}
          >
            {accionando === 'iniciar' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.btnPrimarioTxt}>🚚  Iniciar ruta</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ── JORNADA COMPLETADA ── */}
      {ruta?.estado === 'completada' ? (
        <View style={[s.card, s.cardCompletada]}>
          <Text style={s.completadaIcono}>🎉</Text>
          <Text style={s.completadaTit}>¡Jornada completada!</Text>
          <Text style={s.completadaNota}>
            {entregadas} de {total} entregas exitosas. Buen trabajo.
          </Text>
        </View>
      ) : null}

      {/* ── PROGRESO ── */}
      {ruta?.estado === 'en_ruta' ? (
        <View style={s.card}>
          <View style={s.progresoFila}>
            <Text style={s.cardLabel}>Progreso del día</Text>
            <Text style={s.pctTxt}>{Math.round(pct * 100)}%</Text>
          </View>
          <View style={s.barraContenedor}>
            <View style={[s.barraRelleno, { width: barraAncho }]} />
          </View>
          <Text style={s.progresoDetalle}>
            {entregadas} entregadas · {cerradas - entregadas} fallidas · {total - cerradas} pendientes
          </Text>
          {todasCerradas ? (
            <TouchableOpacity
              style={[s.btnVerde, accionando === 'completar' && s.btnOff]}
              onPress={onCompletarRuta}
              disabled={!!accionando}
              activeOpacity={0.85}
            >
              {accionando === 'completar' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.btnPrimarioTxt}>✅  Finalizar jornada</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* ── LISTA DE PARADAS ── */}
      {ruta && paradas.length > 0 ? (
        <View style={s.listaParadas}>
          <Text style={s.secTit}>Paradas ({total})</Text>
          {paradas.map((parada, idx) => {
            const cliente   = parada.clientes
            const meta      = ESTADO[parada.estado] ?? ESTADO.pendiente
            const enProceso = accionando === parada.id
            const activa    = ruta.estado === 'en_ruta'
            const tieneUbic = !!(cliente?.lat && cliente?.lng)

            return (
              <View
                key={parada.id}
                style={[s.parada, { backgroundColor: meta.fondo, borderColor: meta.borde }]}
              >
                {/* ── fila superior: número + datos + btn navegar ── */}
                <View style={s.paradaFila}>
                  <View style={s.paradaNumCircle}>
                    <Text style={s.paradaNum}>{idx + 1}</Text>
                  </View>

                  <View style={s.paradaDetalle}>
                    <Text style={s.paradaNombre}>{cliente?.nombre ?? '—'}</Text>
                    {cliente?.direccion ? (
                      <Text style={s.paradaDireccion}>{cliente.direccion}</Text>
                    ) : null}
                    <View style={s.tagsFila}>
                      <Text style={[s.estadoBadge, { color: meta.texto, borderColor: meta.borde }]}>
                        {meta.icono} {meta.label}
                      </Text>
                      {cliente?.pedido_kg > 0 ? (
                        <Text style={s.tag}>{cliente.pedido_kg} kg</Text>
                      ) : null}
                      {cliente?.zona ? (
                        <Text style={s.tag}>{cliente.zona}</Text>
                      ) : null}
                    </View>
                    {parada.estado === 'en_sitio' && tiemposEnSitio[parada.id] != null ? (
                      <Text style={s.timerTxt}>⏱ {formatearTiempo(tiemposEnSitio[parada.id])} en sitio</Text>
                    ) : null}
                    {(parada.estado === 'entregado' || parada.estado === 'fallido') &&
                      parada.ts_llegada && parada.ts_completada ? (
                      <Text style={s.duracionTxt}>
                        Servicio: {formatearTiempo(Math.round(
                          (new Date(parada.ts_completada) - new Date(parada.ts_llegada)) / 1000
                        ))}
                      </Text>
                    ) : null}
                  </View>

                  {/* Botón navegar — siempre visible si tiene coordenadas */}
                  <TouchableOpacity
                    style={[s.btnNav, !tieneUbic && s.btnNavOff]}
                    onPress={() => abrirNavegacion(cliente?.lat, cliente?.lng, cliente?.nombre ?? 'cliente')}
                    activeOpacity={0.8}
                  >
                    <Text style={s.btnNavIcono}>🗺️</Text>
                    <Text style={s.btnNavTxt}>Ir</Text>
                  </TouchableOpacity>
                </View>

                {/* ── acciones de estado ── */}
                {activa && parada.estado === 'pendiente' ? (
                  <TouchableOpacity
                    style={[s.btnAccion, s.btnLlegue, enProceso && s.btnOff]}
                    onPress={() => onMarcarParada(parada, 'en_sitio')}
                    disabled={!!accionando}
                    activeOpacity={0.85}
                  >
                    {enProceso ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={s.btnAccionTxt}>📍  Llegué al sitio</Text>
                    )}
                  </TouchableOpacity>
                ) : null}

                {activa && parada.estado === 'en_sitio' ? (
                  <View style={s.btnsEntrega}>
                    <TouchableOpacity
                      style={[s.btnAccion, s.btnEntregado, s.btnMitad, enProceso && s.btnOff]}
                      onPress={() => onMarcarParada(parada, 'entregado')}
                      disabled={!!accionando}
                      activeOpacity={0.85}
                    >
                      {enProceso ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={s.btnAccionTxt}>✅  Entregado</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.btnAccion, s.btnFallido, s.btnMitad, enProceso && s.btnOff]}
                      onPress={() => onMarcarParada(parada, 'fallido')}
                      disabled={!!accionando}
                      activeOpacity={0.85}
                    >
                      {enProceso ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={s.btnAccionTxt}>❌  No entregado</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            )
          })}
        </View>
      ) : null}

      {/* ── FOOTER ── */}
      <TouchableOpacity style={s.btnCerrar} onPress={cerrarSesion}>
        <Text style={s.btnCerrarTxt}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  pagina:    { flex: 1, backgroundColor: '#0f172a' },
  contenido: { padding: 20, paddingBottom: 48 },
  centro:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  cargandoTxt: { marginTop: 12, color: '#64748b', fontSize: 14 },

  // Cabecera
  cabecera:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  cabeceraIzq: { flex: 1 },
  cabeceraDer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  saludo:      { fontSize: 20, fontWeight: '700', color: '#f1f5f9' },
  fechaTxt:    { fontSize: 13, color: '#64748b', marginTop: 3, textTransform: 'capitalize' },
  gpsChip:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#14352a', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  gpsChipOff:  { backgroundColor: '#3b1111' },
  gpsPunto:    { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e' },
  gpsPuntoOff: { backgroundColor: '#ef4444' },
  gpsTxt:      { fontSize: 11, fontWeight: '700', color: '#86efac' },
  gpsTxtOff:   { color: '#fca5a5' },
  btnDebug:    { backgroundColor: '#1e293b', borderRadius: 10, padding: 8 },
  btnDebugTxt: { fontSize: 18 },

  // Error
  errorBox: { backgroundColor: '#3b1111', borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#dc2626' },
  errorTxt: { color: '#fca5a5', fontSize: 13 },

  // Sin ruta
  sinRuta:      { alignItems: 'center', paddingVertical: 60 },
  sinRutaIcono: { fontSize: 52, marginBottom: 16 },
  sinRutaTit:   { fontSize: 18, fontWeight: '700', color: '#f1f5f9', marginBottom: 8 },
  sinRutaNota:  { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 22, marginBottom: 24, paddingHorizontal: 16 },

  // Card genérico
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 3,
  },
  cardCompletada: { alignItems: 'center', paddingVertical: 32 },
  cardLabel:     { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  resumenTxt:    { fontSize: 22, fontWeight: '700', color: '#f1f5f9', marginBottom: 16 },

  // Completada
  completadaIcono: { fontSize: 52, marginBottom: 12 },
  completadaTit:   { fontSize: 20, fontWeight: '700', color: '#f1f5f9', marginBottom: 8 },
  completadaNota:  { fontSize: 14, color: '#64748b', textAlign: 'center' },

  // Progreso
  progresoFila:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  pctTxt:          { fontSize: 20, fontWeight: '800', color: '#22c55e' },
  barraContenedor: { height: 10, backgroundColor: '#0f172a', borderRadius: 5, marginBottom: 8 },
  barraRelleno:    { height: 10, backgroundColor: '#22c55e', borderRadius: 5 },
  progresoDetalle: { fontSize: 12, color: '#64748b' },

  // Botones principales
  btnPrimario: { backgroundColor: '#2563eb', borderRadius: 12, padding: 16, alignItems: 'center', shadowColor: '#2563eb', shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  btnVerde:    { backgroundColor: '#16a34a', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 14, shadowColor: '#16a34a', shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  btnPrimarioTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnSecundario:  { borderWidth: 1, borderColor: '#334155', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  btnSecundarioTxt: { color: '#94a3b8', fontWeight: '600' },
  btnOff: { opacity: 0.5 },

  // Lista paradas
  listaParadas: { marginBottom: 8 },
  secTit: { fontSize: 14, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },

  // Parada individual
  parada:       { borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1 },
  paradaFila:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  paradaNumCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  paradaNum:    { fontSize: 13, fontWeight: '800', color: '#94a3b8' },
  paradaDetalle:{ flex: 1 },
  paradaNombre: { fontSize: 15, fontWeight: '700', color: '#f1f5f9' },
  paradaDireccion: { fontSize: 13, color: '#64748b', marginTop: 2 },
  tagsFila:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  estadoBadge:  { fontSize: 12, fontWeight: '700', borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tag:          { fontSize: 11, color: '#64748b', backgroundColor: '#0f172a', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  timerTxt:     { fontSize: 12, color: '#60a5fa', fontWeight: '700', marginTop: 6 },
  duracionTxt:  { fontSize: 11, color: '#475569', marginTop: 4 },

  // Botón navegar (siempre visible)
  btnNav: {
    backgroundColor: '#1e40af',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    minWidth: 52,
    shadowColor: '#1e40af', shadowOpacity: 0.4, shadowRadius: 6, elevation: 3,
  },
  btnNavOff:   { backgroundColor: '#1e293b' },
  btnNavIcono: { fontSize: 18 },
  btnNavTxt:   { fontSize: 10, fontWeight: '700', color: '#fff', marginTop: 2 },

  // Botones de acción de parada
  btnAccion:    { borderRadius: 10, padding: 13, alignItems: 'center', marginTop: 12 },
  btnAccionTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnLlegue:    { backgroundColor: '#2563eb' },
  btnsEntrega:  { flexDirection: 'row', gap: 8, marginTop: 12 },
  btnMitad:     { flex: 1 },
  btnEntregado: { backgroundColor: '#16a34a' },
  btnFallido:   { backgroundColor: '#dc2626' },

  // Footer
  btnCerrar:    { alignItems: 'center', marginTop: 16, paddingVertical: 12 },
  btnCerrarTxt: { color: '#475569', fontSize: 13 },
})

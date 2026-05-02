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
import { registrarEvento } from '../lib/eventos'
import { detenerTracking, iniciarTracking } from '../lib/gps'
import { activarRuta, actualizarEstadoParada, cargarRutaHoy } from '../lib/ruta'

const ANCHO = Dimensions.get('window').width - 48

const ESTADO = {
  pendiente: { label: 'Pendiente', fondo: '#f3f4f6', texto: '#374151', icono: '⏳' },
  en_sitio:  { label: 'En sitio',  fondo: '#dbeafe', texto: '#1e40af', icono: '📍' },
  entregado: { label: 'Entregado', fondo: '#d1fae5', texto: '#065f46', icono: '✅' },
  fallido:   { label: 'Fallido',   fondo: '#fee2e2', texto: '#991b1b', icono: '❌' },
}

export default function RutaScreen({ navigation }) {
  const { conductor, cerrarSesion } = useAuth()
  const [ruta, setRuta]         = useState(null)
  const [paradas, setParadas]   = useState([])
  const [cargando, setCargando] = useState(true)
  const [refresco, setRefresco] = useState(false)
  const [error, setError]       = useState(null)
  const [accionando, setAccionando] = useState(null)
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

  // GPS: encender cuando la ruta está activa, apagar en cualquier otro estado
  useEffect(() => {
    if (ruta?.estado === 'en_ruta' && conductor) {
      iniciarTracking(conductor.id)
        .then((sub) => { trackingRef.current = sub })
        .catch((e) => console.warn('[RutaScreen] GPS:', e?.message))
    } else {
      detenerTracking(trackingRef.current)
      trackingRef.current = null
    }
    return () => {
      detenerTracking(trackingRef.current)
      trackingRef.current = null
    }
  }, [ruta?.estado, conductor])

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
      const tipo =
        nuevoEstado === 'en_sitio' ? 'llegada_parada' : `parada_${nuevoEstado}`
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

  function abrirNavegacion(lat, lng, nombre) {
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
        <ActivityIndicator size="large" color="#1e40af" />
      </View>
    )
  }

  const entregadas = paradas.filter((p) => p.estado === 'entregado').length
  const total      = paradas.length
  const barraAncho = total > 0 ? Math.round((entregadas / total) * ANCHO) : 0

  return (
    <ScrollView
      style={s.pagina}
      contentContainerStyle={s.contenido}
      refreshControl={<RefreshControl refreshing={refresco} onRefresh={onRefrescar} />}
    >
      {/* ── CABECERA ── */}
      <View style={s.cabecera}>
        <View>
          <Text style={s.saludo}>
            Hola, {conductor?.nombre?.split(' ')[0] ?? 'conductor'}
          </Text>
          <Text style={s.fechaTxt}>
            {new Date().toLocaleDateString('es-VE', {
              weekday: 'long', day: 'numeric', month: 'long',
            })}
          </Text>
        </View>
        <View style={s.cabeceraDer}>
          {ruta?.estado === 'en_ruta' && (
            <View style={s.gpsChip}>
              <Text style={s.gpsTxt}>● GPS</Text>
            </View>
          )}
          <TouchableOpacity onPress={() => navigation.navigate('Debug')}>
            <Text style={s.btnDebug}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── ERROR ── */}
      {error ? (
        <View style={s.errorBox}>
          <Text style={s.errorTxt}>{error}</Text>
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
          <TouchableOpacity style={s.btnRefrescar} onPress={onRefrescar}>
            <Text style={s.btnRefrescarTxt}>Actualizar</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ── RUTA PENDIENTE ── */}
      {ruta?.estado === 'pendiente' ? (
        <View style={s.bloque}>
          <Text style={s.resumenTxt}>{total} paradas asignadas</Text>
          <TouchableOpacity
            style={[s.btnIniciar, accionando === 'iniciar' && s.btnDisabled]}
            onPress={onIniciarRuta}
            disabled={!!accionando}
          >
            {accionando === 'iniciar' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.btnIniciarTxt}>🚚 Iniciar ruta</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ── PROGRESO (solo en_ruta) ── */}
      {ruta?.estado === 'en_ruta' ? (
        <View style={s.bloque}>
          <View style={s.barraContenedor}>
            <View style={[s.barraRelleno, { width: barraAncho }]} />
          </View>
          <Text style={s.progresoTxt}>
            {entregadas} de {total} entregas completadas
          </Text>
        </View>
      ) : null}

      {/* ── PARADAS ── */}
      {ruta && paradas.length > 0 ? (
        <View style={s.bloque}>
          <Text style={s.secTit}>Paradas</Text>
          {paradas.map((parada, idx) => {
            const cliente   = parada.clientes
            const meta      = ESTADO[parada.estado] ?? ESTADO.pendiente
            const enProceso = accionando === parada.id
            const activa    = ruta.estado === 'en_ruta'

            return (
              <View key={parada.id} style={[s.parada, { backgroundColor: meta.fondo }]}>
                <View style={s.paradaFila}>
                  <Text style={s.paradaNum}>{idx + 1}</Text>
                  <View style={s.paradaDetalle}>
                    <Text style={s.paradaNombre}>{cliente?.nombre ?? '—'}</Text>
                    {cliente?.direccion ? (
                      <TouchableOpacity
                        onPress={() => abrirNavegacion(cliente.lat, cliente.lng, cliente.nombre)}
                      >
                        <Text style={s.paradaDireccion}>
                          📍 {cliente.direccion}
                        </Text>
                      </TouchableOpacity>
                    ) : cliente?.lat ? (
                      <TouchableOpacity
                        onPress={() => abrirNavegacion(cliente.lat, cliente.lng, cliente.nombre)}
                      >
                        <Text style={s.paradaDireccion}>📍 Ver en mapa</Text>
                      </TouchableOpacity>
                    ) : null}
                    <View style={s.tagsFila}>
                      {cliente?.pedido_kg > 0 ? (
                        <Text style={s.tag}>{cliente.pedido_kg} kg</Text>
                      ) : null}
                      {cliente?.zona ? (
                        <Text style={s.tag}>{cliente.zona}</Text>
                      ) : null}
                      <Text style={[s.estadoTag, { color: meta.texto }]}>
                        {meta.icono} {meta.label}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Botón: pendiente → llegué */}
                {activa && parada.estado === 'pendiente' ? (
                  <TouchableOpacity
                    style={[s.btnAccion, s.btnLlegue, enProceso && s.btnDisabled]}
                    onPress={() => onMarcarParada(parada, 'en_sitio')}
                    disabled={!!accionando}
                  >
                    {enProceso ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={s.btnAccionTxt}>📍 Llegué al sitio</Text>
                    )}
                  </TouchableOpacity>
                ) : null}

                {/* Botones: en_sitio → entregado / fallido */}
                {activa && parada.estado === 'en_sitio' ? (
                  <View style={s.btnsEntrega}>
                    <TouchableOpacity
                      style={[s.btnAccion, s.btnEntregado, s.btnMitad, enProceso && s.btnDisabled]}
                      onPress={() => onMarcarParada(parada, 'entregado')}
                      disabled={!!accionando}
                    >
                      {enProceso ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={s.btnAccionTxt}>✅ Entregado</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.btnAccion, s.btnFallido, s.btnMitad, enProceso && s.btnDisabled]}
                      onPress={() => onMarcarParada(parada, 'fallido')}
                      disabled={!!accionando}
                    >
                      {enProceso ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={s.btnAccionTxt}>❌ No pudo</Text>
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
  pagina:   { flex: 1, backgroundColor: '#f9fafb' },
  contenido: { padding: 24, paddingBottom: 40 },
  centro:   { flex: 1, justifyContent: 'center', alignItems: 'center' },

  cabecera:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  saludo:      { fontSize: 22, fontWeight: '700', color: '#111827' },
  fechaTxt:    { fontSize: 13, color: '#6b7280', marginTop: 2, textTransform: 'capitalize' },
  cabeceraDer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gpsChip:     { backgroundColor: '#d1fae5', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  gpsTxt:      { fontSize: 11, fontWeight: '700', color: '#065f46' },
  btnDebug:    { fontSize: 22 },

  errorBox: { backgroundColor: '#fee2e2', borderRadius: 8, padding: 12, marginBottom: 12 },
  errorTxt: { color: '#991b1b', fontSize: 13 },

  sinRuta:      { alignItems: 'center', paddingVertical: 48 },
  sinRutaIcono: { fontSize: 48, marginBottom: 12 },
  sinRutaTit:   { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 8 },
  sinRutaNota:  { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  btnRefrescar:    { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  btnRefrescarTxt: { color: '#374151', fontWeight: '600' },

  bloque:      { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  resumenTxt:  { fontSize: 14, color: '#6b7280', marginBottom: 12 },
  secTit:      { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 },

  btnIniciar:    { backgroundColor: '#1e40af', borderRadius: 10, padding: 16, alignItems: 'center' },
  btnIniciarTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled:   { opacity: 0.5 },

  barraContenedor: { height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, marginBottom: 8 },
  barraRelleno:    { height: 8, backgroundColor: '#22c55e', borderRadius: 4 },
  progresoTxt:     { fontSize: 13, color: '#374151' },

  parada:         { borderRadius: 10, padding: 14, marginBottom: 10 },
  paradaFila:     { flexDirection: 'row', gap: 12 },
  paradaNum:      { fontSize: 18, fontWeight: '700', color: '#9ca3af', width: 24 },
  paradaDetalle:  { flex: 1 },
  paradaNombre:   { fontSize: 15, fontWeight: '600', color: '#111827' },
  paradaDireccion:{ fontSize: 13, color: '#6b7280', marginTop: 2 },
  tagsFila:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tag:            { backgroundColor: '#ffffff88', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, fontSize: 11, color: '#374151' },
  estadoTag:      { fontSize: 12, fontWeight: '600' },

  btnAccion:    { borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 10 },
  btnAccionTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnLlegue:    { backgroundColor: '#2563eb' },
  btnsEntrega:  { flexDirection: 'row', gap: 8, marginTop: 10 },
  btnMitad:     { flex: 1 },
  btnEntregado: { backgroundColor: '#16a34a' },
  btnFallido:   { backgroundColor: '#dc2626' },

  btnCerrar:    { alignItems: 'center', marginTop: 8 },
  btnCerrarTxt: { color: '#9ca3af', fontSize: 13 },
})

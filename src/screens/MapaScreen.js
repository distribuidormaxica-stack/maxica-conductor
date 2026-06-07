import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native'
import { WebView } from 'react-native-webview'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import { cargarRutaHoy } from '../lib/ruta'
import { colors } from '../theme'

const COLOR_ESTADO = {
  pendiente: '#94A3B8',
  en_sitio:  '#0284C7',
  entregado: '#16A34A',
  fallido:   '#DC2626',
  rechazado: '#F97316',
}

// HTML con Leaflet + OpenStreetMap. Recibe los puntos y la posición del chofer.
function construirHtml(puntos, yo) {
  const data = JSON.stringify(puntos)
  const me = yo ? JSON.stringify(yo) : 'null'
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  html,body,#map{height:100%;margin:0;padding:0;background:#F1F5F9}
  .pin{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;
       color:#fff;font-weight:800;font-size:13px;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);font-family:system-ui,Arial}
  .me{width:18px;height:18px;border-radius:50%;background:#1D4ED8;border:3px solid #fff;box-shadow:0 0 0 6px rgba(29,78,216,.25)}
  .leaflet-popup-content{font-family:system-ui,Arial;font-size:13px}
</style>
</head><body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var puntos = ${data};
  var yo = ${me};
  var map = L.map('map', { zoomControl: true, attributionControl: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  var bounds = [];
  puntos.forEach(function(p){
    if(!p.lat || !p.lng) return;
    var icon = L.divIcon({ className:'', html:'<div class="pin" style="background:'+p.color+'">'+p.n+'</div>', iconSize:[30,30], iconAnchor:[15,15] });
    L.marker([p.lat, p.lng], { icon: icon }).addTo(map)
      .bindPopup('<b>'+p.n+'. '+p.nombre+'</b>' + (p.estado?'<br/><span style="color:'+p.color+'">'+p.estado+'</span>':''));
    bounds.push([p.lat, p.lng]);
  });
  if(yo){
    L.marker([yo.lat, yo.lng], { icon: L.divIcon({ className:'', html:'<div class="me"></div>', iconSize:[18,18], iconAnchor:[9,9] }) })
      .addTo(map).bindPopup('Tú estás aquí');
    bounds.push([yo.lat, yo.lng]);
  }
  if(bounds.length >= 2){ map.fitBounds(bounds, { padding:[50,50], maxZoom:15 }); }
  else if(bounds.length === 1){ map.setView(bounds[0], 14); }
  else { map.setView([10.16, -68.0], 11); }
</script>
</body></html>`
}

const ESTADO_LABEL = {
  pendiente: 'Pendiente', en_sitio: 'En sitio', entregado: 'Entregado',
  fallido: 'No entregado', rechazado: 'Rechazado',
}

export default function MapaScreen() {
  const { conductor } = useAuth()
  const insets = useSafeAreaInsets()
  const [paradas, setParadas] = useState([])
  const [yo, setYo] = useState(null)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    if (!conductor) return
    setCargando(true)
    try {
      const datos = await cargarRutaHoy(conductor.id)
      setParadas(datos?.paradas ?? [])
    } catch { setParadas([]) }
    try {
      const { status } = await Location.getForegroundPermissionsAsync()
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        setYo({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      }
    } catch {}
    setCargando(false)
  }, [conductor])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const puntos = useMemo(() => {
    return paradas
      .map((p, i) => {
        const c = p.clientes
        if (!c?.lat || !c?.lng) return null
        return {
          n: i + 1,
          lat: c.lat,
          lng: c.lng,
          nombre: (c.nombre ?? '').replace(/'/g, '’'),
          estado: ESTADO_LABEL[p.estado] ?? '',
          color: COLOR_ESTADO[p.estado] ?? COLOR_ESTADO.pendiente,
        }
      })
      .filter(Boolean)
  }, [paradas])

  const html = useMemo(() => construirHtml(puntos, yo), [puntos, yo])

  if (cargando) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={s.cargandoTxt}>Cargando mapa…</Text>
      </View>
    )
  }

  if (puntos.length === 0) {
    return (
      <View style={s.center}>
        <Ionicons name="map-outline" size={48} color={colors.textMuted} />
        <Text style={s.emptyTit}>Sin puntos para mostrar</Text>
        <Text style={s.emptyNota}>No hay paradas con ubicación en tu ruta de hoy.</Text>
        <TouchableOpacity style={s.btnOutline} onPress={cargar} activeOpacity={0.85}>
          <Ionicons name="refresh" size={16} color={colors.primary} />
          <Text style={s.btnOutlineTxt}>Actualizar</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={s.root}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={s.web}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={[s.center, StyleSheet.absoluteFill]}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
      />
      {/* Botón flotante: recargar */}
      <TouchableOpacity style={[s.fab, { bottom: insets.bottom + 18 }]} onPress={cargar} activeOpacity={0.85}>
        <Ionicons name="refresh" size={22} color="#fff" />
      </TouchableOpacity>
      {/* Leyenda */}
      <View style={[s.leyenda, { top: insets.top + 12 }]}>
        <Text style={s.leyendaTit}>{puntos.length} paradas</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  web: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg, padding: 24, gap: 10 },
  cargandoTxt: { color: colors.textSoft, fontSize: 14, fontWeight: '600' },
  emptyTit: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 4 },
  emptyNota: { fontSize: 13.5, color: colors.textMuted, textAlign: 'center', marginBottom: 8 },
  btnOutline: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
    borderWidth: 1.5, borderColor: colors.primary, borderRadius: 999,
    paddingHorizontal: 22, paddingVertical: 11,
  },
  btnOutlineTxt: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  fab: {
    position: 'absolute', right: 18, width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#0F172A', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  leyenda: {
    position: 'absolute', left: 14,
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 7,
    shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
  },
  leyendaTit: { fontSize: 13, fontWeight: '800', color: colors.text },
})

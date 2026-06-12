import { useRef } from 'react'
import { Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { WebView } from 'react-native-webview'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, radius, shadow } from '../theme'

// Canvas de firma dentro de un WebView (sin dependencias nativas nuevas →
// compatible con OTA). El canvas avisa 'VACIA' si se confirma sin trazos;
// si no, manda el PNG en base64 (sin el prefijo data:).
const HTML_FIRMA = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#fff}canvas{touch-action:none;display:block}</style>
</head><body><canvas id="c"></canvas>
<script>
var c = document.getElementById('c')
var ctx = c.getContext('2d')
var trazos = 0, dibujando = false
function resize(){
  var dpr = window.devicePixelRatio || 1
  c.width = window.innerWidth * dpr; c.height = window.innerHeight * dpr
  c.style.width = window.innerWidth + 'px'; c.style.height = window.innerHeight + 'px'
  ctx.scale(dpr, dpr)
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, window.innerWidth, window.innerHeight)
  ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111827'
}
resize()
function pos(e){
  var t = e.touches ? e.touches[0] : e
  var r = c.getBoundingClientRect()
  return [t.clientX - r.left, t.clientY - r.top]
}
function start(e){ e.preventDefault(); dibujando = true; trazos++; var p = pos(e); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + 0.1, p[1]); ctx.stroke() }
function move(e){ if(!dibujando) return; e.preventDefault(); var p = pos(e); ctx.lineTo(p[0], p[1]); ctx.stroke() }
function end(){ dibujando = false }
c.addEventListener('touchstart', start, {passive:false})
c.addEventListener('touchmove', move, {passive:false})
c.addEventListener('touchend', end)
c.addEventListener('mousedown', start); c.addEventListener('mousemove', move); c.addEventListener('mouseup', end)
function limpiar(){ trazos = 0; resize() }
function enviar(){
  if (trazos === 0) { window.ReactNativeWebView.postMessage('VACIA'); return }
  window.ReactNativeWebView.postMessage(c.toDataURL('image/png').split(',')[1])
}
</script></body></html>`

export default function FirmaModal({ visible, clienteNombre, onConfirmar, onCancelar }) {
  const webRef = useRef(null)
  const insets = useSafeAreaInsets()

  function onMensaje(e) {
    const dato = e.nativeEvent.data
    if (dato === 'VACIA') {
      Alert.alert('Firma vacía', 'Pide al cliente que firme en el recuadro antes de confirmar.')
      return
    }
    onConfirmar(dato)
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancelar}>
      <View style={[st.pagina, { paddingTop: insets.top }]}>
        <View style={st.header}>
          <View style={{ flex: 1 }}>
            <Text style={st.titulo}>Firma del cliente</Text>
            {clienteNombre ? <Text style={st.sub} numberOfLines={1}>{clienteNombre}</Text> : null}
          </View>
          <TouchableOpacity style={st.cerrarBtn} onPress={onCancelar} hitSlop={10}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={st.lienzo}>
          <WebView
            ref={webRef}
            source={{ html: HTML_FIRMA }}
            originWhitelist={['*']}
            javaScriptEnabled
            onMessage={onMensaje}
            scrollEnabled={false}
            bounces={false}
            setBuiltInZoomControls={false}
          />
          <View pointerEvents="none" style={st.guia}>
            <Text style={st.guiaTxt}>Firme aquí</Text>
          </View>
        </View>

        <View style={[st.footer, { paddingBottom: insets.bottom + 14 }]}>
          <TouchableOpacity
            style={st.btnBorrar}
            onPress={() => webRef.current?.injectJavaScript('limpiar();true;')}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh" size={16} color={colors.textSoft} />
            <Text style={st.btnBorrarTxt}>Borrar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={st.btnConfirmar}
            onPress={() => webRef.current?.injectJavaScript('enviar();true;')}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={st.btnConfirmarTxt}>Confirmar firma</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const st = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 18, paddingVertical: 14,
  },
  titulo: { fontSize: 18, fontWeight: '800', color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  cerrarBtn: {
    width: 36, height: 36, borderRadius: radius.full, backgroundColor: colors.surface,
    justifyContent: 'center', alignItems: 'center', ...shadow(2),
  },
  lienzo: {
    flex: 1, marginHorizontal: 14, borderRadius: radius.lg, overflow: 'hidden',
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff', ...shadow(2),
  },
  guia: {
    position: 'absolute', bottom: 14, left: 0, right: 0, alignItems: 'center',
  },
  guiaTxt: { color: '#CBD5E1', fontSize: 13, fontWeight: '600' },
  footer: { flexDirection: 'row', gap: 10, padding: 14 },
  btnBorrar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface, paddingVertical: 14, paddingHorizontal: 20,
  },
  btnBorrarTxt: { color: colors.textSoft, fontWeight: '700', fontSize: 14 },
  btnConfirmar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: colors.success, borderRadius: radius.full, paddingVertical: 14, ...shadow(4),
  },
  btnConfirmarTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
})

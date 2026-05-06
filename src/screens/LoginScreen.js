import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native'
import { useAuth } from '../context/AuthContext'

export default function LoginScreen() {
  const { iniciarSesion } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)
  const [verPass, setVerPass]   = useState(false)

  async function onSubmit() {
    if (!email || !password) {
      Alert.alert('Faltan datos', 'Ingresa tu email y contraseña.')
      return
    }
    setCargando(true)
    try {
      await iniciarSesion(email.trim(), password)
    } catch (e) {
      Alert.alert('Error al ingresar', e?.message ?? String(e))
    } finally {
      setCargando(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Fondo dividido: azul arriba, gris claro abajo */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={{ flex: 0.52, backgroundColor: '#0F172A' }} />
        <View style={{ flex: 0.48, backgroundColor: '#F4F7FB' }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* ══ HERO ══════════════════════════════════════════════════════════ */}
        <View style={s.hero}>
          {/* Anillos decorativos detrás del logo */}
          <View style={s.ring3} />
          <View style={s.ring2} />
          <View style={s.ring1} />
          <View style={s.logoWrap}>
            <Image
              source={require('../../assets/logo.png')}
              style={s.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={s.appSub}>Sistema de conductores</Text>
        </View>

        {/* ══ FORM CARD ════════════════════════════════════════════════════ */}
        <View style={s.formCard}>
          <Text style={s.formTit}>Bienvenido</Text>
          <Text style={s.formSub}>Inicia sesión para ver tu ruta del día</Text>

          <Text style={s.label}>Correo electrónico</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="correo@empresa.com"
            placeholderTextColor="#94a3b8"
            returnKeyType="next"
          />

          <Text style={s.label}>Contraseña</Text>
          <View style={s.inputWrap}>
            <TextInput
              style={s.inputInner}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!verPass}
              placeholder="••••••••"
              placeholderTextColor="#94a3b8"
              returnKeyType="done"
              onSubmitEditing={onSubmit}
            />
            <TouchableOpacity style={s.eyeBtn} onPress={() => setVerPass((v) => !v)}>
              <Text style={s.eyeIcon}>{verPass ? '🙈' : '👁'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[s.btn, cargando && s.btnOff]}
            onPress={onSubmit}
            disabled={cargando}
            activeOpacity={0.85}
          >
            <Text style={s.btnTxt}>{cargando ? 'Entrando…' : 'Entrar'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.aviso}>Acceso exclusivo para conductores autorizados</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },

  // ── Hero ──
  hero: { alignItems: 'center', marginBottom: 28 },

  // Anillos decorativos concéntricos
  ring3: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.04)', top: -10,
  },
  ring2: {
    position: 'absolute', width: 156, height: 156, borderRadius: 78,
    backgroundColor: 'rgba(255,255,255,0.06)', top: 12,
  },
  ring1: {
    position: 'absolute', width: 114, height: 114, borderRadius: 57,
    backgroundColor: 'rgba(255,255,255,0.09)', top: 33,
  },

  logoWrap: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 14,
  },
  logo:   { width: 170, height: 68 },
  appSub: { fontSize: 13, color: '#93c5fd', letterSpacing: 0.8, fontWeight: '600' },

  // ── Form card ──
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 26, paddingTop: 28, paddingBottom: 26,
    shadowColor: '#0F172A', shadowOpacity: 0.18, shadowRadius: 24, elevation: 10,
  },
  formTit: { fontSize: 22, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  formSub: { fontSize: 13, color: '#94a3b8', marginBottom: 24 },

  label: {
    fontSize: 11, fontWeight: '700', color: '#64748b',
    textTransform: 'uppercase', letterSpacing: 0.7,
    marginBottom: 7, marginTop: 16,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1.5, borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: '#0f172a',
  },

  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1.5, borderColor: '#e2e8f0',
    borderRadius: 12,
  },
  inputInner: {
    flex: 1,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: '#0f172a',
  },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 10 },
  eyeIcon: { fontSize: 16 },

  btn: {
    backgroundColor: '#0284C7',
    borderRadius: 100,
    padding: 17,
    alignItems: 'center',
    marginTop: 28,
    shadowColor: '#0284C7', shadowOpacity: 0.4, shadowRadius: 10, elevation: 5,
  },
  btnOff: { opacity: 0.5 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.3 },

  aviso: { textAlign: 'center', color: '#94a3b8', fontSize: 12, marginTop: 28, lineHeight: 18 },
})

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
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* ══ HERO ════════════════════════════════════════════════════��═════ */}
        <View style={s.hero}>
          <Image
            source={require('../../assets/logo.png')}
            style={s.logo}
            resizeMode="contain"
          />
          <Text style={s.appSub}>Sistema de conductores</Text>
        </View>

        {/* ══ FORM CARD ══════════════════════════════════════════════════════ */}
        <View style={s.formCard}>
          <Text style={s.formTit}>Iniciar sesión</Text>

          <Text style={s.label}>Correo electrónico</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="correo@ejemplo.com"
            placeholderTextColor="#94a3b8"
            returnKeyType="next"
          />

          <Text style={s.label}>Contraseña</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor="#94a3b8"
            returnKeyType="done"
            onSubmitEditing={onSubmit}
          />

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
  root:   { flex: 1, backgroundColor: '#1e3a5f' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },

  // Hero
  hero:   { alignItems: 'center', marginBottom: 32 },
  logo:   { width: 200, height: 80, marginBottom: 10 },
  appSub: { fontSize: 13, color: '#93c5fd', letterSpacing: 0.5 },

  // Form card
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 28,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, elevation: 8,
  },
  formTit: { fontSize: 19, fontWeight: '700', color: '#0f172a', marginBottom: 22 },

  label: {
    fontSize: 11, fontWeight: '700', color: '#64748b',
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginBottom: 7, marginTop: 16,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1.5, borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: '#0f172a',
  },

  btn: {
    backgroundColor: '#1e40af',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 26,
    shadowColor: '#1e40af', shadowOpacity: 0.35, shadowRadius: 8, elevation: 4,
  },
  btnOff: { opacity: 0.5 },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },

  aviso: { textAlign: 'center', color: '#64748b', fontSize: 12, marginTop: 24 },
})

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
      Alert.alert('No pudimos entrar', e?.message ?? String(e))
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

        {/* ── HEADER ── */}
        <View style={s.header}>
          <View style={s.logoCircle}>
            <Text style={s.logoIcon}>🚚</Text>
          </View>
          <Text style={s.appName}>Maxica Ruta</Text>
          <Text style={s.appSub}>Plataforma de conductores</Text>
        </View>

        {/* ── FORM ── */}
        <View style={s.card}>
          <Text style={s.cardTit}>Iniciar sesión</Text>

          <Text style={s.label}>Correo electrónico</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="correo@ejemplo.com"
            placeholderTextColor="#94a3b8"
          />

          <Text style={s.label}>Contraseña</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor="#94a3b8"
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

        <Text style={s.footer}>Solo para conductores autorizados</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#0f172a' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },

  header: { alignItems: 'center', marginBottom: 32 },
  logoCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#1e40af',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#1e40af', shadowOpacity: 0.5, shadowRadius: 20, elevation: 8,
  },
  logoIcon: { fontSize: 36 },
  appName:  { fontSize: 28, fontWeight: '800', color: '#f1f5f9', letterSpacing: 0.5 },
  appSub:   { fontSize: 13, color: '#64748b', marginTop: 4 },

  card: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  cardTit: { fontSize: 18, fontWeight: '700', color: '#f1f5f9', marginBottom: 20 },

  label: {
    fontSize: 12, fontWeight: '600', color: '#94a3b8',
    marginBottom: 6, marginTop: 14,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#0f172a',
    borderWidth: 1, borderColor: '#334155',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#f1f5f9',
  },

  btn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#2563eb', shadowOpacity: 0.4, shadowRadius: 8, elevation: 4,
  },
  btnOff:  { opacity: 0.5 },
  btnTxt:  { color: '#fff', fontWeight: '700', fontSize: 16 },

  footer: { textAlign: 'center', color: '#475569', fontSize: 12, marginTop: 24 },
})

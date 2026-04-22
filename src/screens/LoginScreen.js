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
} from 'react-native'
import { useAuth } from '../context/AuthContext'

export default function LoginScreen() {
  const { iniciarSesion } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)

  async function onSubmit() {
    if (!email || !password) {
      Alert.alert('Faltan datos', 'Ingresa email y contraseña.')
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
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={s.titulo}>Maxica Ruta</Text>
      <Text style={s.subtitulo}>Acceso conductor</Text>

      <Text style={s.label}>Email</Text>
      <TextInput
        style={s.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="correo@ejemplo.com"
        placeholderTextColor="#9ca3af"
      />

      <Text style={s.label}>Contraseña</Text>
      <TextInput
        style={s.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="••••••••"
        placeholderTextColor="#9ca3af"
      />

      <TouchableOpacity
        style={[s.boton, cargando && s.botonDeshab]}
        onPress={onSubmit}
        disabled={cargando}
      >
        <Text style={s.botonTxt}>{cargando ? 'Entrando…' : 'Entrar'}</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  titulo: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1e40af',
    textAlign: 'center',
  },
  subtitulo: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 32,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  boton: {
    backgroundColor: '#1e40af',
    padding: 14,
    borderRadius: 8,
    marginTop: 24,
  },
  botonDeshab: { opacity: 0.6 },
  botonTxt: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 16,
  },
})

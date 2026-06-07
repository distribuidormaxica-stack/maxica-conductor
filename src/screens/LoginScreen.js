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
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import { colors, radius, shadow } from '../theme'

export default function LoginScreen() {
  const { iniciarSesion } = useAuth()
  const insets = useSafeAreaInsets()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)
  const [verPass, setVerPass]   = useState(false)
  const [foco, setFoco]         = useState(null)

  async function onSubmit() {
    if (!email || !password) {
      Alert.alert('Faltan datos', 'Ingresa tu correo y contraseña.')
      return
    }
    setCargando(true)
    try {
      await iniciarSesion(email.trim(), password)
    } catch (e) {
      Alert.alert('No pudimos iniciar sesión', e?.message ?? String(e))
    } finally {
      setCargando(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ══ LOGO sobre blanco ══ */}
        <View style={s.hero}>
          <Image
            source={require('../../assets/logo.png')}
            style={s.logo}
            resizeMode="contain"
          />
          <View style={s.subPill}>
            <Ionicons name="car-sport" size={14} color={colors.primary} />
            <Text style={s.subPillTxt}>App de conductores</Text>
          </View>
        </View>

        {/* ══ TARJETA DE LOGIN ══ */}
        <View style={s.card}>
          <Text style={s.title}>Bienvenido</Text>
          <Text style={s.subtitle}>Inicia sesión para ver tu ruta del día</Text>

          {/* Correo */}
          <Text style={s.label}>Correo electrónico</Text>
          <View style={[s.field, foco === 'email' && s.fieldFoco]}>
            <Ionicons name="mail-outline" size={20} color={foco === 'email' ? colors.primary : colors.textMuted} />
            <TextInput
              style={s.input}
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFoco('email')}
              onBlur={() => setFoco(null)}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="correo@empresa.com"
              placeholderTextColor={colors.textMuted}
              returnKeyType="next"
            />
          </View>

          {/* Contraseña */}
          <Text style={[s.label, { marginTop: 16 }]}>Contraseña</Text>
          <View style={[s.field, foco === 'pass' && s.fieldFoco]}>
            <Ionicons name="lock-closed-outline" size={20} color={foco === 'pass' ? colors.primary : colors.textMuted} />
            <TextInput
              style={s.input}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFoco('pass')}
              onBlur={() => setFoco(null)}
              secureTextEntry={!verPass}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              onSubmitEditing={onSubmit}
            />
            <TouchableOpacity onPress={() => setVerPass((v) => !v)} hitSlop={10} style={s.eyeBtn}>
              <Ionicons
                name={verPass ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.textSoft}
              />
            </TouchableOpacity>
          </View>

          {/* Botón */}
          <TouchableOpacity
            style={[s.btn, cargando && s.btnOff]}
            onPress={onSubmit}
            disabled={cargando}
            activeOpacity={0.85}
          >
            {cargando ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={s.btnTxt}>Entrar</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={s.footer}>
          <Ionicons name="shield-checkmark-outline" size={14} color={colors.textMuted} />
          <Text style={s.footerTxt}>Acceso exclusivo para conductores autorizados</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 },

  hero: { alignItems: 'center', marginBottom: 32 },
  logo: { width: 230, height: 96 },
  subPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.full,
    marginTop: 10,
  },
  subPillTxt: { color: colors.primaryDark, fontSize: 12.5, fontWeight: '700', letterSpacing: 0.3 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 24, paddingTop: 26, paddingBottom: 26,
    ...shadow(8),
  },
  title:    { fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: 4 },
  subtitle: { fontSize: 13.5, color: colors.textMuted, marginBottom: 22 },

  label: {
    fontSize: 11, fontWeight: '700', color: colors.textSoft,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8,
  },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
  },
  fieldFoco: { borderColor: colors.primary, backgroundColor: colors.surface },
  input: { flex: 1, paddingVertical: 14, fontSize: 15.5, color: colors.text },
  eyeBtn: { padding: 4 },

  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 16,
    marginTop: 26,
    ...shadow(6),
  },
  btnOff: { opacity: 0.6 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.3 },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 26 },
  footerTxt: { textAlign: 'center', color: colors.textMuted, fontSize: 12 },
})

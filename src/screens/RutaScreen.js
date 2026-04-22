import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useAuth } from '../context/AuthContext'

export default function RutaScreen({ navigation }) {
  const { conductor, cerrarSesion } = useAuth()

  return (
    <View style={s.container}>
      <Text style={s.saludo}>Hola {conductor?.nombre ?? 'conductor'}</Text>
      <Text style={s.nota}>
        Tu ruta del día aparecerá aquí. Todavía en construcción — próxima
        iteración cargamos las paradas reales desde Supabase.
      </Text>

      <View style={{ flex: 1 }} />

      <TouchableOpacity
        style={s.btnSec}
        onPress={() => navigation.navigate('Debug')}
      >
        <Text style={s.btnSecTxt}>Panel de debug</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.btnSalir} onPress={cerrarSesion}>
        <Text style={s.btnSalirTxt}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  saludo: { fontSize: 22, fontWeight: '700', marginTop: 24, color: '#111827' },
  nota: { fontSize: 14, color: '#6b7280', marginTop: 12, lineHeight: 20 },
  btnSec: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  btnSecTxt: { textAlign: 'center', color: '#374151', fontWeight: '500' },
  btnSalir: { backgroundColor: '#dc2626', padding: 14, borderRadius: 8 },
  btnSalirTxt: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 15,
  },
})

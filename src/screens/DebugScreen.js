import { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { suscribirLogs, limpiarLogs } from '../lib/logger'

const colorPorNivel = {
  log: '#374151',
  info: '#1e40af',
  warn: '#b45309',
  error: '#dc2626',
}

export default function DebugScreen() {
  const [logs, setLogs] = useState([])

  useEffect(() => {
    const unsub = suscribirLogs(setLogs)
    return () => unsub()
  }, [])

  const ordenInverso = [...logs].reverse()

  return (
    <View style={s.container}>
      <View style={s.barra}>
        <Text style={s.contador}>{logs.length} log(s)</Text>
        <TouchableOpacity onPress={limpiarLogs}>
          <Text style={s.limpiar}>Limpiar</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={s.lista}>
        {logs.length === 0 && <Text style={s.vacio}>Sin logs todavía.</Text>}
        {ordenInverso.map((l, i) => (
          <View key={i} style={s.fila}>
            <Text
              style={[
                s.nivel,
                { color: colorPorNivel[l.nivel] ?? '#374151' },
              ]}
            >
              {l.nivel.toUpperCase()} · {l.ts.slice(11, 19)}
            </Text>
            <Text style={s.mensaje}>{l.mensaje}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  barra: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
  },
  contador: { fontSize: 14, fontWeight: '600', color: '#374151' },
  limpiar: { color: '#2563eb', fontWeight: '600' },
  lista: { flex: 1 },
  vacio: { padding: 16, color: '#9ca3af', textAlign: 'center' },
  fila: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#f3f4f6',
  },
  nivel: { fontSize: 11, fontWeight: '700' },
  mensaje: { fontSize: 13, color: '#111827', marginTop: 2 },
})

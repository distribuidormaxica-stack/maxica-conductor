import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

function hoyISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function CierreJornadaScreen({ navigation }) {
  const { conductor } = useAuth()
  const [kmIni, setKmIni] = useState('')
  const [kmFin, setKmFin] = useState('')
  const [limpio, setLimpio] = useState(true)
  const [horaLlegada, setHoraLlegada] = useState('')
  const [horaSalida, setHoraSalida] = useState('')
  const [contratiempo, setContratiempo] = useState(false)
  const [detalle, setDetalle] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [enviando, setEnviando] = useState(false)

  const recorridos = Math.max(0, (Number(kmFin) || 0) - (Number(kmIni) || 0))

  async function enviar() {
    if (!kmFin) return Alert.alert('Falta dato', 'Ingresa el kilometraje final')
    if (!horaLlegada) return Alert.alert('Falta dato', 'Ingresa la hora de llegada')
    if (!horaSalida) return Alert.alert('Falta dato', 'Ingresa la hora de salida')
    if (Number(kmFin) > 0 && Number(kmFin) < Number(kmIni)) {
      return Alert.alert('Revisa', 'El Km final no puede ser menor que el inicial')
    }
    if (contratiempo && !detalle.trim()) {
      return Alert.alert('Falta dato', 'Explica qué problema hubo al cargar')
    }

    setEnviando(true)
    try {
      // tenant_id lo rellena el trigger; conductor_id es obligatorio para la RLS.
      const { error } = await supabase.from('flota_cierre_jornada').insert({
        fecha: hoyISO(),
        conductor_id: conductor.id,
        vehiculo_id: null,
        km_ini: Number(kmIni) || null,
        km_fin: Number(kmFin) || null,
        limpieza: limpio ? 'Sí' : 'No',
        hora_llegada: horaLlegada,
        hora_salida: horaSalida,
        contratiempo,
        detalle_contratiempo: contratiempo ? detalle.trim() : null,
        observaciones: observaciones.trim() || null,
      })
      if (error) throw error
      Alert.alert('¡Reporte enviado!', `${recorridos} km recorridos. Buen descanso.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ])
    } catch (e) {
      Alert.alert('Error', e?.message ?? 'Intenta de nuevo')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <ScrollView style={s.cont} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={s.titulo}>Cierre de jornada</Text>
      <Text style={s.sub}>Reporta tu día antes de entregar el vehículo</Text>

      {/* Kilometraje */}
      <View style={s.card}>
        <Text style={s.cardTit}>🚛 Kilometraje</Text>
        <View style={s.fila}>
          <View style={s.col}>
            <Text style={s.label}>Inicio</Text>
            <TextInput style={[s.input, s.inputKm]} value={kmIni} onChangeText={setKmIni} keyboardType="numeric" placeholder="0" />
          </View>
          <View style={s.col}>
            <Text style={s.label}>Final</Text>
            <TextInput style={[s.input, s.inputKm]} value={kmFin} onChangeText={setKmFin} keyboardType="numeric" placeholder="0" />
          </View>
        </View>
        {recorridos > 0 && <Text style={s.kmDiff}>{recorridos} km recorridos</Text>}

        <Text style={[s.label, { marginTop: 14 }]}>¿Entregaste el vehículo limpio?</Text>
        <View style={s.toggleRow}>
          <Toggle activo={limpio} ok onPress={() => setLimpio(true)} label="✓ Sí" />
          <Toggle activo={!limpio} danger onPress={() => setLimpio(false)} label="✗ No" />
        </View>
      </View>

      {/* Horarios */}
      <View style={s.card}>
        <Text style={s.cardTit}>⏰ Horarios en la distribuidora</Text>
        <View style={s.fila}>
          <View style={s.col}>
            <Text style={s.label}>Llegada</Text>
            <TextInput style={s.input} value={horaLlegada} onChangeText={setHoraLlegada} placeholder="08:00" />
          </View>
          <View style={s.col}>
            <Text style={s.label}>Salida</Text>
            <TextInput style={s.input} value={horaSalida} onChangeText={setHoraSalida} placeholder="09:30" />
          </View>
        </View>

        <Text style={[s.label, { marginTop: 14 }]}>¿Problemas al cargar el camión?</Text>
        <View style={s.toggleRow}>
          <Toggle activo={!contratiempo} ok onPress={() => setContratiempo(false)} label="✓ Todo bien" />
          <Toggle activo={contratiempo} warn onPress={() => setContratiempo(true)} label="⚠ Hubo problema" />
        </View>
        {contratiempo && (
          <TextInput style={[s.input, s.area, { marginTop: 10 }]} value={detalle} onChangeText={setDetalle}
            placeholder="Explica qué pasó (faltó mercancía, demora...)" multiline />
        )}
      </View>

      {/* Observaciones */}
      <View style={s.card}>
        <Text style={s.cardTit}>📋 Novedades del día (opcional)</Text>
        <TextInput style={[s.input, s.area]} value={observaciones} onChangeText={setObservaciones}
          placeholder="Cualquier novedad: daño en mercancía, falla del vehículo, etc." multiline />
      </View>

      <TouchableOpacity style={[s.btn, enviando && { opacity: 0.6 }]} onPress={enviar} disabled={enviando}>
        {enviando ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Enviar reporte ✓</Text>}
      </TouchableOpacity>
    </ScrollView>
  )
}

function Toggle({ activo, ok, danger, warn, onPress, label }) {
  const color = ok ? '#22c55e' : danger ? '#ef4444' : warn ? '#f59e0b' : '#3b82f6'
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[s.toggle, activo && { borderColor: color, backgroundColor: color + '1a' }]}
    >
      <Text style={[s.toggleTxt, activo && { color }]}>{label}</Text>
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  cont: { flex: 1, backgroundColor: '#F4F7FB' },
  titulo: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  sub: { fontSize: 13, color: '#64748b', marginTop: 2, marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  cardTit: { fontSize: 13, fontWeight: '800', color: '#0284C7', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },
  fila: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
  label: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: 6 },
  input: { backgroundColor: '#f1f5f9', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 14, height: 52, fontSize: 16, color: '#0f172a' },
  inputKm: { fontSize: 24, fontWeight: '800', textAlign: 'center', height: 72 },
  area: { height: 90, paddingTop: 14, textAlignVertical: 'top' },
  kmDiff: { textAlign: 'center', fontSize: 14, fontWeight: '700', color: '#22c55e', marginTop: 10 },
  toggleRow: { flexDirection: 'row', gap: 10 },
  toggle: { flex: 1, height: 52, borderRadius: 14, borderWidth: 2, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  toggleTxt: { fontSize: 15, fontWeight: '800', color: '#94a3b8' },
  btn: { backgroundColor: '#0284C7', borderRadius: 16, height: 58, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  btnTxt: { color: '#fff', fontSize: 17, fontWeight: '800' },
})

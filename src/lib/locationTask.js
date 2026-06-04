// Tarea de ubicación en SEGUNDO PLANO. Se ejecuta aunque la app esté
// minimizada o el teléfono bloqueado (vía foreground service en Android).
// Debe registrarse al arrancar la app (App.js la importa al inicio).
import * as TaskManager from 'expo-task-manager'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

export const LOCATION_TASK = 'maxica-location-task'

const kmh = (speed) => (speed != null && speed >= 0 ? Math.round(speed * 3.6) : null)

async function flushPendientes() {
  try {
    const raw = await AsyncStorage.getItem('gps.pendientes')
    const pend = raw ? JSON.parse(raw) : []
    if (!pend.length) return
    await supabase.from('trayecto').insert(pend)
    await AsyncStorage.removeItem('gps.pendientes')
  } catch {
    // sigue sin red; se reintenta luego
  }
}

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) { console.warn('[bg-gps]', error.message); return }
  const locations = data?.locations
  if (!locations?.length || !supabase) return

  let conductorId, rutaId
  try {
    conductorId = await AsyncStorage.getItem('gps.conductorId')
    rutaId = await AsyncStorage.getItem('gps.rutaId')
  } catch { return }
  if (!conductorId) return

  const filas = locations.map((loc) => ({
    conductor_id: conductorId,
    ruta_id: rutaId || null,
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    velocidad_kmh: kmh(loc.coords.speed),
  }))
  const ultima = locations[locations.length - 1]

  try {
    // Última posición conocida (para el mapa en vivo del despacho)
    await supabase.from('ubicaciones').upsert({
      conductor_id: conductorId,
      lat: ultima.coords.latitude,
      lng: ultima.coords.longitude,
      velocidad_kmh: kmh(ultima.coords.speed),
      precision_m: ultima.coords.accuracy != null ? Math.round(ultima.coords.accuracy) : null,
      actualizado_en: new Date(ultima.timestamp || Date.now()).toISOString(),
    })
    // Historial del recorrido
    await supabase.from('trayecto').insert(filas)
    // Si había puntos en cola por falta de red, mandarlos ahora
    await flushPendientes()
  } catch (e) {
    // Sin red: encolar para reintentar (máx 500 puntos para no crecer sin fin)
    try {
      const raw = await AsyncStorage.getItem('gps.pendientes')
      const pend = raw ? JSON.parse(raw) : []
      pend.push(...filas)
      await AsyncStorage.setItem('gps.pendientes', JSON.stringify(pend.slice(-500)))
    } catch {}
  }
})

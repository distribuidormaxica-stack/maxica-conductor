import * as Location from 'expo-location'
import { supabase } from './supabase'

export async function solicitarPermiso() {
  const { status } = await Location.requestForegroundPermissionsAsync()
  return status === 'granted'
}

export async function iniciarTracking(conductorId, rutaId = null) {
  const concedido = await solicitarPermiso()
  if (!concedido) throw new Error('Permiso de ubicación denegado')

  const sub = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 30000,  // cada 30 seg
      distanceInterval: 50, // o cada 50 m
    },
    async (loc) => {
      if (!supabase) return
      const lat = loc.coords.latitude
      const lng = loc.coords.longitude
      const velocidad_kmh = loc.coords.speed != null ? Math.round(loc.coords.speed * 3.6) : null
      const precision_m   = loc.coords.accuracy != null ? Math.round(loc.coords.accuracy) : null
      const ahora = new Date().toISOString()

      try {
        // Posición actual (upsert — solo guarda la última)
        await supabase.from('ubicaciones').upsert({
          conductor_id: conductorId,
          lat,
          lng,
          velocidad_kmh,
          precision_m,
          actualizado_en: ahora,
        })
        // Historial del recorrido (insert — acumula todos los pings del día)
        await supabase.from('trayecto').insert({
          conductor_id: conductorId,
          ruta_id: rutaId,
          lat,
          lng,
          velocidad_kmh,
        })
      } catch (e) {
        console.warn('[gps] error al enviar ubicación:', e?.message)
      }
    },
  )
  return sub
}

export function detenerTracking(sub) {
  if (sub?.remove) sub.remove()
}

import * as Location from 'expo-location'
import { supabase } from './supabase'

export async function solicitarPermiso() {
  const { status } = await Location.requestForegroundPermissionsAsync()
  return status === 'granted'
}

export async function iniciarTracking(conductorId) {
  const concedido = await solicitarPermiso()
  if (!concedido) throw new Error('Permiso de ubicación denegado')

  const sub = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 30000,  // cada 30 seg
      distanceInterval: 50, // o cada 50 m, lo que ocurra primero
    },
    async (loc) => {
      if (!supabase) return
      try {
        await supabase.from('ubicaciones').upsert({
          conductor_id: conductorId,
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          velocidad_kmh:
            loc.coords.speed != null ? Math.round(loc.coords.speed * 3.6) : null,
          precision_m: loc.coords.accuracy != null ? Math.round(loc.coords.accuracy) : null,
          actualizado_en: new Date().toISOString(),
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

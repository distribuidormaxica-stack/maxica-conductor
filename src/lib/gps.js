import * as Location from 'expo-location'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LOCATION_TASK } from './locationTask'

// Pide permiso de primer plano (obligatorio) y de segundo plano (para seguir
// rastreando con la app minimizada o el teléfono bloqueado).
export async function solicitarPermiso() {
  const fg = await Location.requestForegroundPermissionsAsync()
  if (fg.status !== 'granted') return { foreground: false, background: false }
  let bg = { status: 'denied' }
  try { bg = await Location.requestBackgroundPermissionsAsync() } catch {}
  return { foreground: true, background: bg.status === 'granted' }
}

// Arranca el tracking en SEGUNDO PLANO (foreground service en Android).
// Guarda conductorId/rutaId para que la tarea headless sepa a quién registrar.
export async function iniciarTracking(conductorId, rutaId = null) {
  const permisos = await solicitarPermiso()
  if (!permisos.foreground) throw new Error('Permiso de ubicación denegado')

  await AsyncStorage.setItem('gps.conductorId', String(conductorId))
  await AsyncStorage.setItem('gps.rutaId', rutaId ? String(rutaId) : '')

  const yaActivo = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)
  if (yaActivo) await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => {})

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 15000,   // cada 15 s
    distanceInterval: 20,  // o cada 20 m
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Maxica — seguimiento activo',
      notificationBody: 'Registrando tu ruta para el despacho.',
      notificationColor: '#0284C7',
    },
  })
  return { background: permisos.background }
}

// Detiene el tracking. (No necesita argumento; se conserva por compatibilidad.)
export async function detenerTracking() {
  try {
    const activo = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)
    if (activo) await Location.stopLocationUpdatesAsync(LOCATION_TASK)
  } catch {}
  try { await AsyncStorage.setItem('gps.rutaId', '') } catch {}
}

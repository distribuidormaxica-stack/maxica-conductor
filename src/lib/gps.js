import * as Location from 'expo-location'
import * as IntentLauncher from 'expo-intent-launcher'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LOCATION_TASK } from './locationTask'

const PACKAGE = 'com.cerrato23.maxicaconductor'

// Pide al sistema EXCLUIR la app de la optimización de batería (una sola vez).
// Es la causa #1 de "sin señal" en Android: aunque haya foreground service, los
// fabricantes (Xiaomi, Tecno, Infinix, Samsung…) matan el servicio para ahorrar
// batería salvo que la app esté exenta. Defensivo: si algo falla, no estorba al
// tracking. Se pregunta una sola vez (flag en AsyncStorage) para no fastidiar.
export async function pedirExencionBateria({ reintentar = false } = {}) {
  if (Platform.OS !== 'android') return
  try {
    const pedidaEn = await AsyncStorage.getItem('bateria.exencionPedidaEn')
    const yaPedida = pedidaEn || (await AsyncStorage.getItem('bateria.exencionPedida'))
    if (yaPedida && !reintentar) return
    // Reintento: solo cuando el watchdog detectó que el sistema MATÓ el servicio
    // (señal de que la exención no está concedida), y máximo una vez por semana
    // para no fastidiar al chofer.
    if (yaPedida && reintentar) {
      const hace = pedidaEn ? Date.now() - new Date(pedidaEn).getTime() : Infinity
      if (hace < 7 * 24 * 60 * 60 * 1000) return
    }
    await IntentLauncher.startActivityAsync(
      'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      { data: `package:${PACKAGE}` },
    )
    await AsyncStorage.setItem('bateria.exencionPedida', '1')
    await AsyncStorage.setItem('bateria.exencionPedidaEn', new Date().toISOString())
  } catch {
    // Algunos teléfonos no exponen este intent: no pasa nada, el chofer puede
    // desactivar la optimización a mano desde Ajustes.
  }
}

// ¿El servicio de tracking sigue registrado en el sistema? Si devuelve false
// con una ruta activa, el fabricante lo mató (ahorro de batería agresivo).
export async function estaTrackingActivo() {
  try { return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK) } catch { return false }
}

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
  // Sembrar el latido con "ahora": sin esto, el watchdog vería el tick viejo de
  // la ruta anterior (o ninguno) y reiniciaría el tracking recién arrancado.
  await AsyncStorage.setItem('gps.ultimoTick', new Date().toISOString())

  const yaActivo = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)
  if (yaActivo) await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => {})

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 15000,   // cada 15 s
    // 0 = sin umbral de distancia: el chofer DETENIDO sigue reportando cada
    // 15 s. Con 20 m, un camión parado 20 min descargando caía a "Sin señal"
    // en el panel siendo falso (causa #3 del diagnóstico de tracking).
    distanceInterval: 0,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'MaxiRutas — seguimiento activo',
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

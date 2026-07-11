import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

// ============================================================
// Candado de dispositivo (mig ruta 0027).
// ------------------------------------------------------------
// Identificamos el teléfono con un UUID de INSTALACIÓN persistido en
// AsyncStorage. A propósito NO usamos expo-application/expo-device: agregar un
// módulo nativo obligaría a recompilar la APK (eas build); con solo AsyncStorage
// esto se publica por OTA (eas update). Un UUID por instalación basta para el
// objetivo: cada teléfono que instala la app tiene su propio id, así que un
// segundo teléfono con el mismo correo es rechazado.
// ============================================================

const KEY = 'maxica_device_id'

function uuidSimple() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** Id estable del teléfono (persiste entre sesiones). Se crea una sola vez. */
export async function obtenerDeviceId() {
  try {
    let id = await AsyncStorage.getItem(KEY)
    if (!id) {
      id = uuidSimple()
      await AsyncStorage.setItem(KEY, id)
    }
    return id
  } catch {
    // Si AsyncStorage falla, devolvemos uno efímero: no ideal, pero no dejamos
    // al conductor sin poder entrar por un glitch de almacenamiento.
    return uuidSimple()
  }
}

function nombreDispositivo() {
  return Platform.OS === 'ios' ? 'iPhone' : 'Android'
}

/**
 * Reclama/verifica el dispositivo en el servidor. Devuelve:
 *   { ok: true }                         -> registrado o mismo teléfono
 *   { ok: false, estado:'otro_dispositivo' } -> otro teléfono ya vinculado
 *   { ok: false, estado:'error' }        -> fallo de red/servidor (fail-open)
 */
export async function reclamarDispositivo() {
  try {
    const deviceId = await obtenerDeviceId()
    const { data, error } = await supabase.rpc('reclamar_dispositivo', {
      p_device_id: deviceId,
      p_nombre: nombreDispositivo(),
    })
    if (error) return { ok: false, estado: 'error', error: error.message }
    return data ?? { ok: false, estado: 'error' }
  } catch (e) {
    return { ok: false, estado: 'error', error: e?.message ?? String(e) }
  }
}

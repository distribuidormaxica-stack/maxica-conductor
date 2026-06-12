// Foto de prueba de entrega (expo-image-picker, módulo nativo: requiere
// APK 1.3.0+). El require va con guarda por si este bundle corre en un
// runtime sin el módulo — en ese caso la foto se omite y la entrega sigue.
let ImagePicker = null
try {
  ImagePicker = require('expo-image-picker')
} catch (_) {}

// Resultado: { base64 } si se tomó, { cancelada: true } si el chofer canceló
// la cámara, { omitida: true } si no hay módulo o no dio permiso.
export async function capturarFotoEntrega() {
  if (!ImagePicker) return { omitida: true }
  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') return { omitida: true }
    const res = await ImagePicker.launchCameraAsync({
      quality: 0.4,
      base64: true,
      exif: false,
      allowsEditing: false,
    })
    if (res.canceled) return { cancelada: true }
    const base64 = res.assets?.[0]?.base64
    if (!base64) return { omitida: true }
    return { base64 }
  } catch (e) {
    console.warn('[foto] no se pudo capturar:', e?.message)
    return { omitida: true }
  }
}

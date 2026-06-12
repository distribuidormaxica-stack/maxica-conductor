import { supabase } from './supabase'

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// base64 → ArrayBuffer sin dependencias nuevas (apto para OTA).
// Usa atob nativo de Hermes si existe; si no, decodifica a mano.
function base64ABuffer(b64) {
  if (typeof global.atob === 'function') {
    const bin = global.atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out.buffer
  }
  const limpio = b64.replace(/[^A-Za-z0-9+/]/g, '')
  const bytes = []
  let buffer = 0
  let bits = 0
  for (const ch of limpio) {
    buffer = (buffer << 6) | B64.indexOf(ch)
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }
  return new Uint8Array(bytes).buffer
}

// Sube firma (png) o foto (jpg) de una parada al bucket privado 'entregas'
// (carpeta del tenant; el RLS exige path = <tenant_id>/...). Best-effort:
// devuelve el path o null si falló — la entrega NUNCA se bloquea por la subida.
export async function subirArchivoEntrega(parada, base64, tipo) {
  try {
    const esFoto = tipo === 'foto'
    const path = `${parada.tenant_id}/${parada.ruta_id}/${parada.id}-${tipo}.${esFoto ? 'jpg' : 'png'}`
    const { error } = await supabase.storage
      .from('entregas')
      .upload(path, base64ABuffer(base64), {
        contentType: esFoto ? 'image/jpeg' : 'image/png',
        upsert: true,
      })
    if (error) throw error
    return path
  } catch (e) {
    console.warn(`[entregas] no se pudo subir ${tipo}:`, e?.message)
    return null
  }
}

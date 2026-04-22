import { supabase } from './supabase'

// Registra un evento en la tabla `eventos` de Supabase. Silencioso ante fallos:
// si no hay backend o falla la inserción, se loguea pero no rompe el flujo.
//
// Uso:
//   registrarEvento('login', { email }, { conductorId })
//   registrarEvento('parada_entregada', { nota }, { conductorId, rutaId, paradaId })
export async function registrarEvento(tipo, payload = {}, ids = {}) {
  if (!supabase) return
  if (!ids.conductorId) return // RLS exige conductor_id; si no lo tenemos, no insertamos
  try {
    const { error } = await supabase.from('eventos').insert({
      tipo,
      payload,
      conductor_id: ids.conductorId,
      ruta_id: ids.rutaId ?? null,
      parada_id: ids.paradaId ?? null,
    })
    if (error) console.warn('[eventos] insert falló:', error.message)
  } catch (e) {
    console.warn('[eventos] excepción:', e?.message ?? String(e))
  }
}

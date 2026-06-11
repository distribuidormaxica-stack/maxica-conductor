import { supabase } from './supabase'
import { fechaHoyVzla } from './fecha'

export async function cargarRutaHoy(conductorId) {
  const hoy = fechaHoyVzla()

  // Trae rutas de hoy o de días anteriores que NO se hayan finalizado
  // (pendiente/en_ruta) — una ruta puede tardar varios días, y mientras el
  // conductor o el admin no la cierren debe seguir apareciéndole. Las
  // 'completada' solo se traen si son de hoy (para la pantalla de jornada
  // completada); las de días pasados ya no reaparecen. No se traen rutas
  // futuras (fecha > hoy).
  const { data: rutas, error: eR } = await supabase
    .from('rutas')
    .select('*')
    .eq('conductor_id', conductorId)
    .lte('fecha', hoy)
    .in('estado', ['pendiente', 'en_ruta', 'completada'])
    .order('fecha', { ascending: true })
    .order('creado_en', { ascending: true })

  if (eR) throw eR
  if (!rutas || rutas.length === 0) return null

  const activas = rutas.filter((r) => r.estado === 'en_ruta' || r.estado === 'pendiente')
  const completadasHoy = rutas.filter((r) => r.estado === 'completada' && r.fecha === hoy)

  // Prioridad: en_ruta más antigua (la que sigue abierta, incluso de días
  // previos) > pendiente más antigua (vencida primero) > completada de hoy.
  const ruta =
    activas.find((r) => r.estado === 'en_ruta') ??
    activas.find((r) => r.estado === 'pendiente') ??
    completadasHoy[completadasHoy.length - 1] ??
    null

  if (!ruta) return null

  const { data: paradas, error: eP } = await supabase
    .from('paradas')
    .select('*, clientes(*)')
    .eq('ruta_id', ruta.id)
    .order('orden')

  if (eP) throw eP

  return { ruta, paradas: paradas ?? [] }
}

export async function activarRuta(rutaId) {
  const { error } = await supabase
    .from('rutas')
    .update({ estado: 'en_ruta', ts_inicio: new Date().toISOString() })
    .eq('id', rutaId)
  if (error) throw error
}

export async function completarRuta(rutaId) {
  const { error } = await supabase
    .from('rutas')
    .update({ estado: 'completada' })
    .eq('id', rutaId)
  if (error) throw error
}

// `extra` (opcional): campos adicionales a mezclar en el update — p. ej.
// { entrega_lat, entrega_lng, distancia_cliente_m, fuera_de_sitio } para la
// prueba de entrega con validación de proximidad.
export async function actualizarEstadoParada(paradaId, estado, extra = null) {
  const ahora = new Date().toISOString()
  const campos = { estado, ...(extra ?? {}) }
  if (estado === 'en_sitio') campos.ts_llegada = ahora
  if (estado === 'entregado' || estado === 'fallido' || estado === 'rechazado') campos.ts_completada = ahora

  const { error } = await supabase
    .from('paradas')
    .update(campos)
    .eq('id', paradaId)
  if (error) throw error
}

// Cargar la siguiente ruta pendiente (múltiples despachos / rutas vencidas sin
// finalizar de días previos). Incluye fecha <= hoy, no solo hoy.
export async function cargarSiguienteRuta(conductorId, rutaActualId) {
  const hoy = fechaHoyVzla()
  const { data: rutas, error } = await supabase
    .from('rutas')
    .select('*')
    .eq('conductor_id', conductorId)
    .lte('fecha', hoy)
    .eq('estado', 'pendiente')
    .order('fecha', { ascending: true })
    .order('creado_en', { ascending: true })
  if (error) throw error
  const siguiente = (rutas ?? []).find((r) => r.id !== rutaActualId)
  if (!siguiente) return null

  const { data: paradas, error: eP } = await supabase
    .from('paradas')
    .select('*, clientes(*)')
    .eq('ruta_id', siguiente.id)
    .order('orden')
  if (eP) throw eP
  return { ruta: siguiente, paradas: paradas ?? [] }
}

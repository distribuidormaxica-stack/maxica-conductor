import { supabase } from './supabase'
import { fechaHoyVzla } from './fecha'

export async function cargarRutaHoy(conductorId) {
  const hoy = fechaHoyVzla()

  const { data: rutas, error: eR } = await supabase
    .from('rutas')
    .select('*')
    .eq('conductor_id', conductorId)
    .eq('fecha', hoy)
    .in('estado', ['pendiente', 'en_ruta', 'completada'])
    .order('creado_en', { ascending: false })

  if (eR) throw eR
  if (!rutas || rutas.length === 0) return null

  // Si hay varias rutas en el día, priorizar: en_ruta > pendiente > completada
  const ruta =
    rutas.find((r) => r.estado === 'en_ruta') ??
    rutas.find((r) => r.estado === 'pendiente') ??
    rutas[0]

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

export async function actualizarEstadoParada(paradaId, estado) {
  const ahora = new Date().toISOString()
  const campos = { estado }
  if (estado === 'en_sitio') campos.ts_llegada = ahora
  if (estado === 'entregado' || estado === 'fallido' || estado === 'rechazado') campos.ts_completada = ahora

  const { error } = await supabase
    .from('paradas')
    .update(campos)
    .eq('id', paradaId)
  if (error) throw error
}

// Cargar la siguiente ruta pendiente del día (para múltiples despachos)
export async function cargarSiguienteRuta(conductorId, rutaActualId) {
  const hoy = fechaHoyVzla()
  const { data: rutas, error } = await supabase
    .from('rutas')
    .select('*')
    .eq('conductor_id', conductorId)
    .eq('fecha', hoy)
    .eq('estado', 'pendiente')
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

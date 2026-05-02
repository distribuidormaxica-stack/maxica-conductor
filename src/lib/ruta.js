import { supabase } from './supabase'

export async function cargarRutaHoy(conductorId) {
  const ahora = new Date()
  const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`
  console.log('[ruta] buscando conductorId:', conductorId, 'fecha:', hoy)

  const { data: ruta, error: eR } = await supabase
    .from('rutas')
    .select('*')
    .eq('conductor_id', conductorId)
    .eq('fecha', hoy)
    .in('estado', ['pendiente', 'en_ruta'])
    .maybeSingle()

  console.log('[ruta] resultado:', JSON.stringify(ruta), 'error:', eR?.message)
  if (eR) throw eR
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
    .update({ estado: 'en_ruta' })
    .eq('id', rutaId)
  if (error) throw error
}

export async function actualizarEstadoParada(paradaId, estado) {
  const ahora = new Date().toISOString()
  const campos = { estado }
  if (estado === 'en_sitio') campos.ts_llegada = ahora
  if (estado === 'entregado' || estado === 'fallido') campos.ts_completada = ahora

  const { error } = await supabase
    .from('paradas')
    .update(campos)
    .eq('id', paradaId)
  if (error) throw error
}

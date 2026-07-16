import { supabase } from './supabase'

// Defaults si el tenant no configuró nada (o no hay red): mismos valores
// que regían antes con el umbral fijo en código.
export const ENTREGA_CONFIG_DEFAULT = {
  radio_entrega_m: 150,
  foto_modo: 'nunca',
  firma_modo: 'nunca',
  unidad_medida: 'kg',
}

// Certificación de entrega del tenant (radio, foto, firma), configurada por el
// panel en Configuración → Entregas. El RLS limita la consulta a la fila del
// tenant del conductor. Best-effort: si la consulta falla (sin señal, tabla
// aún sin migrar) devuelve los defaults — NUNCA bloquea la jornada.
export async function cargarEntregaConfig() {
  try {
    // select('*') a propósito: si la columna unidad_medida aún no existe (mig
    // 0029 sin aplicar), pedir la columna por nombre HARÍA FALLAR toda la
    // consulta y perderíamos también radio/foto/firma ya configurados. Con '*'
    // traemos lo que exista y unidad_medida cae a su default.
    const { data, error } = await supabase
      .from('entrega_config')
      .select('*')
      .limit(1)
      .maybeSingle()
    if (error || !data) return ENTREGA_CONFIG_DEFAULT
    return { ...ENTREGA_CONFIG_DEFAULT, ...data, unidad_medida: (data.unidad_medida || 'kg') }
  } catch (_) {
    return ENTREGA_CONFIG_DEFAULT
  }
}

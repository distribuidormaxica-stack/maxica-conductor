// Siempre retorna la fecha local de Venezuela (UTC-4, sin DST)
export function fechaHoyVzla() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })
}

export function fechaDisplayVzla(opciones = {}) {
  return new Date().toLocaleDateString('es-VE', {
    timeZone: 'America/Caracas',
    ...opciones,
  })
}

// Buffer circular en memoria para el panel de debug in-app.
// Intercepta console.log/warn/error y retiene las últimas N entradas.

const TAM_BUFFER = 200
const buffer = []
const suscriptores = new Set()

function serializar(valor) {
  if (typeof valor === 'string') return valor
  try {
    return JSON.stringify(valor)
  } catch {
    return String(valor)
  }
}

function agregar(nivel, args) {
  const entrada = {
    ts: new Date().toISOString(),
    nivel,
    mensaje: args.map(serializar).join(' '),
  }
  buffer.push(entrada)
  if (buffer.length > TAM_BUFFER) buffer.shift()
  for (const cb of suscriptores) cb([...buffer])
}

let instalado = false

export function instalarLogger() {
  if (instalado) return
  instalado = true
  const orig = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  }
  console.log = (...a) => {
    agregar('log', a)
    orig.log(...a)
  }
  console.info = (...a) => {
    agregar('info', a)
    orig.info(...a)
  }
  console.warn = (...a) => {
    agregar('warn', a)
    orig.warn(...a)
  }
  console.error = (...a) => {
    agregar('error', a)
    orig.error(...a)
  }
}

export function obtenerLogs() {
  return [...buffer]
}

export function suscribirLogs(cb) {
  suscriptores.add(cb)
  cb([...buffer])
  return () => suscriptores.delete(cb)
}

export function limpiarLogs() {
  buffer.length = 0
  for (const cb of suscriptores) cb([])
}

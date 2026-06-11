import { registrarEvento } from './eventos'

// Captura crashes fatales de JS y los registra en la tabla `eventos` de
// Supabase (tipo 'crash_js') para que los errores en campo sean visibles.
//
// RLS exige conductor_id: AuthContext debe llamar setConductorIdParaCrashes()
// cuando se resuelve el conductor (y con null al cerrar sesión). Si todavía
// no hay conductor al momento del crash, registrarEvento simplemente no
// inserta (silencioso, igual que el resto de eventos).

let conductorIdActual = null

export function setConductorIdParaCrashes(id) {
  conductorIdActual = id ?? null
}

let instalado = false

export function instalarCrashLogger() {
  if (instalado) return
  if (typeof ErrorUtils === 'undefined' || !ErrorUtils?.getGlobalHandler) return
  instalado = true

  const handlerOriginal = ErrorUtils.getGlobalHandler()

  ErrorUtils.setGlobalHandler((error, fatal) => {
    try {
      registrarEvento(
        'crash_js',
        {
          mensaje: error?.message ?? String(error),
          stack: (error?.stack || '').slice(0, 3000),
          fatal: !!fatal,
        },
        { conductorId: conductorIdActual },
      )
    } catch {
      // Nunca dejar que el logging interfiera con el manejo del crash.
    }
    // SIEMPRE delegar al handler original: no tragarse el crash.
    if (handlerOriginal) handlerOriginal(error, fatal)
  })
}

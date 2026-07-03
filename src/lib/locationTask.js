// Tarea de ubicación en SEGUNDO PLANO. Se ejecuta aunque la app esté
// minimizada o el teléfono bloqueado (vía foreground service en Android).
// Debe registrarse al arrancar la app (App.js la importa al inicio).
import * as TaskManager from 'expo-task-manager'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

export const LOCATION_TASK = 'maxica-location-task'

const kmh = (speed) => (speed != null && speed >= 0 ? Math.round(speed * 3.6) : null)

// Estado honesto de la subida GPS (lo lee el chip del header en RutaScreen):
// gps.ultimaSubidaOk = ISO de la última subida exitosa
// gps.ultimoError    = mensaje del último fallo
// gps.colaPendientes = cuántos puntos esperan por red
async function marcarSubidaOk() {
  try {
    await AsyncStorage.setItem('gps.ultimaSubidaOk', new Date().toISOString())
    await AsyncStorage.removeItem('gps.ultimoError')
  } catch {}
}
async function marcarError(msg, cola) {
  try {
    await AsyncStorage.setItem('gps.ultimoError', String(msg ?? 'error desconocido'))
    if (cola != null) await AsyncStorage.setItem('gps.colaPendientes', String(cola))
  } catch {}
}

async function encolar(filas) {
  if (!filas?.length) return 0
  try {
    const raw = await AsyncStorage.getItem('gps.pendientes')
    const pend = raw ? JSON.parse(raw) : []
    pend.push(...filas)
    // tope de 500 puntos para no crecer sin fin
    const acotado = pend.slice(-500)
    await AsyncStorage.setItem('gps.pendientes', JSON.stringify(acotado))
    return acotado.length
  } catch {
    return 0
  }
}

async function flushPendientes() {
  try {
    const raw = await AsyncStorage.getItem('gps.pendientes')
    const pend = raw ? JSON.parse(raw) : []
    if (!pend.length) return
    // supabase-js NO lanza en error: hay que mirar `error`. Antes se vaciaba la
    // cola sin verificar y los puntos encolados se PERDÍAN si seguía sin red.
    const { error } = await supabase.from('trayecto').insert(pend)
    if (error) return // se reintenta en el próximo ciclo
    await AsyncStorage.removeItem('gps.pendientes')
    await AsyncStorage.setItem('gps.colaPendientes', '0')
  } catch {
    // sigue sin red; se reintenta luego
  }
}

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) { console.warn('[bg-gps]', error.message); return }
  const locations = data?.locations
  if (!locations?.length || !supabase) return

  let conductorId, rutaId
  try {
    conductorId = await AsyncStorage.getItem('gps.conductorId')
    rutaId = await AsyncStorage.getItem('gps.rutaId')
  } catch { return }
  if (!conductorId) return

  // Sesión fresca ANTES de subir: en segundo plano el auto-refresh de tokens
  // puede no correr (timers congelados) y el JWT vence → upserts con 401
  // silencioso y el chofer "desaparece" del panel hasta reabrir la app.
  // getSession() refresca el token si está vencido.
  let haySesion = true
  try {
    const { data: s } = await supabase.auth.getSession()
    haySesion = !!s?.session
  } catch { haySesion = false }

  // Solo registramos RECORRIDO (trayecto) si hay una ruta activa. Sin ruta_id no
  // se puede atribuir el punto a un despacho y ensucia el mapa (puntos huérfanos
  // que se mezclaban con otras rutas). La última posición (ubicaciones) sí se
  // actualiza siempre, para el punto en vivo del despacho.
  const rutaIdValido = rutaId && rutaId.length ? rutaId : null
  // Filtro de precisión: lecturas con error > 60 m son ruido (edificios,
  // arranque en frío del GPS) — inflan el kilometraje y hacen "saltar" el
  // punto en el mapa. No entran al recorrido.
  const buenas = locations.filter(
    (loc) => loc.coords.accuracy == null || loc.coords.accuracy <= 60,
  )
  const filas = buenas.map((loc) => ({
    conductor_id: conductorId,
    ruta_id: rutaIdValido,
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    velocidad_kmh: kmh(loc.coords.speed),
    // Timestamp REAL de la lectura GPS. Sin esto, creado_en lo pone la BD con
    // now() y TODAS las filas de un mismo INSERT (Android entrega las lecturas
    // en lote) quedan con el mismo timestamp; eso impedía estimar velocidad y
    // calcular bien los km recorridos en el panel.
    creado_en: new Date(loc.timestamp || Date.now()).toISOString(),
  }))
  // Para el punto en vivo, la última lectura decente disponible; si todas
  // vienen muy malas (> 120 m), mejor dejar la anterior que mostrar una errada.
  const ultima = (buenas.length ? buenas : locations)[
    (buenas.length ? buenas : locations).length - 1
  ]
  const ultimaUsable = ultima.coords.accuracy == null || ultima.coords.accuracy <= 120

  const filasTrayecto = rutaIdValido && filas.length ? filas : []

  if (!haySesion) {
    // Sin sesión no se puede subir nada (RLS lo rechazaría): encolar y avisar.
    const cola = await encolar(filasTrayecto)
    await marcarError('sesión vencida — reabre la app Maxica', cola)
    return
  }

  try {
    let fallo = null

    // Última posición conocida (para el mapa en vivo del despacho).
    // OJO: supabase-js NO lanza en error; hay que mirar `error` explícitamente.
    if (ultimaUsable) {
      const { error: eUbic } = await supabase.from('ubicaciones').upsert({
        conductor_id: conductorId,
        lat: ultima.coords.latitude,
        lng: ultima.coords.longitude,
        velocidad_kmh: kmh(ultima.coords.speed),
        precision_m: ultima.coords.accuracy != null ? Math.round(ultima.coords.accuracy) : null,
        actualizado_en: new Date(ultima.timestamp || Date.now()).toISOString(),
      })
      if (eUbic) fallo = eUbic
    }

    // Historial del recorrido (solo con ruta activa y lecturas decentes)
    if (filasTrayecto.length) {
      const { error: eTray } = await supabase.from('trayecto').insert(filasTrayecto)
      if (eTray) {
        fallo = fallo ?? eTray
        const cola = await encolar(filasTrayecto)
        await marcarError(eTray.message, cola)
      }
    }

    if (!fallo) {
      await marcarSubidaOk()
      // Si había puntos en cola por falta de red, mandarlos ahora
      await flushPendientes()
    } else if (!filasTrayecto.length) {
      await marcarError(fallo.message)
    }
  } catch (e) {
    // Sin red total (fetch lanzó): encolar para reintentar
    const cola = await encolar(filasTrayecto)
    await marcarError(e?.message ?? 'sin conexión', cola)
  }
})

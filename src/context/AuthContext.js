import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase, configIncompleta } from '../lib/supabase'
import { registrarEvento } from '../lib/eventos'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [conductor, setConductor] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  // Marcar cuando acabamos de hacer signIn (no sesión restaurada) para
  // registrar el evento 'login' una vez el conductor esté cargado.
  const pendienteLoginRef = useRef(null)

  useEffect(() => {
    if (configIncompleta) {
      setCargando(false)
      return
    }
    let activo = true

    supabase.auth.getSession().then(({ data }) => {
      if (!activo) return
      setSession(data.session)
      if (!data.session) setCargando(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSession(s)
      if (!s) {
        setPerfil(null)
        setConductor(null)
        setCargando(false)
      }
    })

    return () => {
      activo = false
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session?.user) return
    let activo = true
    setCargando(true)
    ;(async () => {
      try {
        const [pRes, cRes] = await Promise.all([
          supabase
            .from('perfiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle(),
          supabase
            .from('conductores')
            .select('*')
            .eq('perfil_id', session.user.id)
            .maybeSingle(),
        ])
        if (!activo) return
        if (pRes.error) throw pRes.error
        if (cRes.error) throw cRes.error
        setPerfil(pRes.data ?? null)
        setConductor(cRes.data ?? null)
      } catch (e) {
        if (!activo) return
        setError(e?.message ?? String(e))
      } finally {
        if (activo) setCargando(false)
      }
    })()
    return () => {
      activo = false
    }
  }, [session])

  useEffect(() => {
    if (conductor && pendienteLoginRef.current) {
      registrarEvento(
        'login',
        { ts: pendienteLoginRef.current },
        { conductorId: conductor.id },
      )
      pendienteLoginRef.current = null
    }
  }, [conductor])

  async function iniciarSesion(email, password) {
    if (!supabase) throw new Error('Configuración incompleta')
    pendienteLoginRef.current = new Date().toISOString()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) {
      pendienteLoginRef.current = null
      throw error
    }
    return data
  }

  async function cerrarSesion() {
    if (!supabase) return
    if (conductor) {
      await registrarEvento('logout', {}, { conductorId: conductor.id })
    }
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        perfil,
        conductor,
        cargando,
        error,
        iniciarSesion,
        cerrarSesion,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}

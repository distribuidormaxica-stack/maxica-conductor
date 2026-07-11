import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { Alert, AppState, View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Updates from 'expo-updates'

import { instalarLogger } from './src/lib/logger'
import { instalarCrashLogger } from './src/lib/crashLogger'
instalarLogger()
instalarCrashLogger()

// Registra la tarea de ubicación en segundo plano (debe correr al arrancar,
// incluso en lanzamientos headless del servicio de ubicación).
import './src/lib/locationTask'

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'

import { AuthProvider, useAuth } from './src/context/AuthContext'
import { configIncompleta, supabase } from './src/lib/supabase'
import LoginScreen from './src/screens/LoginScreen'
import RutaScreen from './src/screens/RutaScreen'
import DebugScreen from './src/screens/DebugScreen'
import CierreJornadaScreen from './src/screens/CierreJornadaScreen'
import MapaScreen from './src/screens/MapaScreen'
import { colors } from './src/theme'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

// Stack de la pestaña "Ruta": la pantalla principal trae su propio encabezado.
function RutaStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Ruta" component={RutaScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CierreJornada" component={CierreJornadaScreen} options={{ title: 'Cierre de jornada' }} />
      <Stack.Screen name="Debug" component={DebugScreen} options={{ title: 'Panel de debug' }} />
    </Stack.Navigator>
  )
}

// Navegación principal con barra inferior: Ruta y Mapa.
function MainTabs() {
  // En Android 15 / edge-to-edge la barra de tabs se dibuja sobre los botones
  // del sistema (atrás/inicio). Sumamos el inset inferior para que no se peguen.
  const insets = useSafeAreaInsets()
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: route.name === 'Mapa',
        headerStyle: { backgroundColor: colors.text },
        headerTitleStyle: { color: '#fff', fontWeight: '800' },
        headerTintColor: '#fff',
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: colors.border,
          height: 62 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
        tabBarIcon: ({ color, size, focused }) => {
          const icon = route.name === 'MiRuta'
            ? (focused ? 'list' : 'list-outline')
            : (focused ? 'map' : 'map-outline')
          return <Ionicons name={icon} size={size} color={color} />
        },
      })}
    >
      <Tab.Screen name="MiRuta" component={RutaStack} options={{ title: 'Ruta' }} />
      <Tab.Screen name="Mapa" component={MapaScreen} options={{ title: 'Mapa del día', tabBarLabel: 'Mapa' }} />
    </Tab.Navigator>
  )
}

function ConfigFaltante() {
  return (
    <View style={s.centro}>
      <Text style={s.titErr}>Configuración incompleta</Text>
      <Text style={s.nota}>
        Faltan EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY en
        .env.local
      </Text>
    </View>
  )
}

function Cargando() {
  return (
    <View style={s.centro}>
      <ActivityIndicator size="large" color="#1e40af" />
    </View>
  )
}

function Rutas() {
  const { session, perfil, conductor, cargando, dispositivoEstado, cerrarSesion } = useAuth()

  if (cargando) return <Cargando />

  if (!session) {
    return (
      <Stack.Navigator>
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    )
  }

  if (!perfil) {
    return (
      <View style={s.centro}>
        <Text style={s.titErr}>Sin perfil configurado</Text>
        <Text style={s.nota}>
          Tu usuario no tiene fila en la tabla perfiles. Contacta al admin.
        </Text>
        <TouchableOpacity style={s.btnSalir} onPress={cerrarSesion}>
          <Text style={s.btnSalirTxt}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (perfil.rol !== 'conductor') {
    return (
      <View style={s.centro}>
        <Text style={s.titErr}>Sin acceso</Text>
        <Text style={s.nota}>
          Esta app es solo para conductores. Tu rol actual: {perfil.rol}
        </Text>
        <TouchableOpacity style={s.btnSalir} onPress={cerrarSesion}>
          <Text style={s.btnSalirTxt}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (!conductor) {
    return (
      <View style={s.centro}>
        <Text style={s.titErr}>Sin registro de conductor</Text>
        <Text style={s.nota}>
          Tu perfil es conductor pero no estás enlazado a la tabla conductores.
          Contacta al admin.
        </Text>
        <TouchableOpacity style={s.btnSalir} onPress={cerrarSesion}>
          <Text style={s.btnSalirTxt}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // Candado de dispositivo: la cuenta ya está activa en otro teléfono.
  if (dispositivoEstado === 'bloqueado') {
    return (
      <View style={s.centro}>
        <Text style={s.titErr}>Cuenta activa en otro teléfono</Text>
        <Text style={s.nota}>
          Esta cuenta ya está vinculada a otro dispositivo. Pídele al despacho que
          {'\n'}"libere el dispositivo" desde el panel para poder usar este teléfono.
        </Text>
        <TouchableOpacity style={s.btnSalir} onPress={cerrarSesion}>
          <Text style={s.btnSalirTxt}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return <MainTabs />
}

export default function App() {
  // El auto-refresh del token de Supabase corre con timers que Android congela
  // en segundo plano: el JWT vencía y el chofer "desaparecía" del panel hasta
  // reabrir la app. Ligarlo al estado de la app garantiza refresh al volver;
  // en segundo plano, la tarea GPS llama getSession() antes de cada subida.
  useEffect(() => {
    if (!supabase) return
    supabase.auth.startAutoRefresh()
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') supabase.auth.startAutoRefresh()
      else supabase.auth.stopAutoRefresh()
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    if (__DEV__) return
    async function verificarActualizacion() {
      try {
        const update = await Updates.checkForUpdateAsync()
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync()
          // No recargar en silencio: avisar al conductor y dejarle elegir.
          // Si elige "Más tarde", expo-updates aplicará la actualización
          // automáticamente en el próximo arranque en frío.
          Alert.alert(
            'Actualización lista',
            'Hay una nueva versión de la app. ¿Aplicarla ahora? Tardará unos segundos.',
            [
              { text: 'Más tarde' },
              { text: 'Aplicar ahora', onPress: () => Updates.reloadAsync() },
            ],
          )
        }
      } catch {}
    }
    verificarActualizacion()
  }, [])

  if (configIncompleta) return <ConfigFaltante />
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <Rutas />
        </NavigationContainer>
      </AuthProvider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  )
}

const s = StyleSheet.create({
  centro: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F4F7FB',
  },
  titErr: {
    fontSize: 18,
    fontWeight: '700',
    color: '#dc2626',
    marginBottom: 8,
    textAlign: 'center',
  },
  nota: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },
  btnSalir: { marginTop: 24, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 28, paddingVertical: 12 },
  btnSalirTxt: { fontSize: 14, color: '#6b7280', fontWeight: '600' },
})

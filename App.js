import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as Updates from 'expo-updates'

import { instalarLogger } from './src/lib/logger'
instalarLogger()

// Registra la tarea de ubicación en segundo plano (debe correr al arrancar,
// incluso en lanzamientos headless del servicio de ubicación).
import './src/lib/locationTask'

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'

import { AuthProvider, useAuth } from './src/context/AuthContext'
import { configIncompleta } from './src/lib/supabase'
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
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: route.name === 'Mapa',
        headerStyle: { backgroundColor: colors.text },
        headerTitleStyle: { color: '#fff', fontWeight: '800' },
        headerTintColor: '#fff',
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: '#fff', borderTopColor: colors.border, height: 62, paddingBottom: 8, paddingTop: 6 },
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
  const { session, perfil, conductor, cargando, cerrarSesion } = useAuth()

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

  return <MainTabs />
}

export default function App() {
  useEffect(() => {
    if (__DEV__) return
    async function verificarActualizacion() {
      try {
        const update = await Updates.checkForUpdateAsync()
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync()
          await Updates.reloadAsync()
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

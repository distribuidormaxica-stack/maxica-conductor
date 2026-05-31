import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as Updates from 'expo-updates'

import { instalarLogger } from './src/lib/logger'
instalarLogger()

import { AuthProvider, useAuth } from './src/context/AuthContext'
import { configIncompleta } from './src/lib/supabase'
import LoginScreen from './src/screens/LoginScreen'
import RutaScreen from './src/screens/RutaScreen'
import DebugScreen from './src/screens/DebugScreen'
import CierreJornadaScreen from './src/screens/CierreJornadaScreen'

const Stack = createNativeStackNavigator()

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

  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Ruta"
        component={RutaScreen}
        options={({ navigation }) => ({
          title: 'Mi ruta',
          headerRight: () => (
            <TouchableOpacity onPress={() => navigation.navigate('CierreJornada')} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ color: '#0284C7', fontWeight: '700', fontSize: 14 }}>Cerrar jornada</Text>
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen
        name="CierreJornada"
        component={CierreJornadaScreen}
        options={{ title: 'Cierre de jornada' }}
      />
      <Stack.Screen
        name="Debug"
        component={DebugScreen}
        options={{ title: 'Panel de debug' }}
      />
    </Stack.Navigator>
  )
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

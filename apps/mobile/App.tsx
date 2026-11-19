import { ActivityIndicator, LogBox, View } from 'react-native';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AccountScreen } from './src/screens/AccountScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { DestinationScreen } from './src/screens/DestinationScreen';
import { EmailRecoveryScreen } from './src/screens/EmailRecoveryScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { OriginScreen } from './src/screens/OriginScreen';
import { RateRideScreen } from './src/screens/RateRideScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { RideScreen } from './src/screens/RideScreen';
import { RouteFareScreen } from './src/screens/RouteFareScreen';
import { VerificationScreen } from './src/screens/VerificationScreen';
import { AuthProvider, useAuth } from './src/state/AuthContext';
import { BookingProvider } from './src/state/BookingContext';
import { RideProvider } from './src/state/RideContext';
import { colors } from './src/theme';
import type { RootStackParamList } from './src/navigation/types';

LogBox.ignoreLogs(['MapLibre Native [ERROR] [Mbgl-MapRenderer] std::bad_alloc']);

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
  },
};

function RootNavigator() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <View
        style={{
          alignItems: 'center',
          backgroundColor: colors.background,
          flex: 1,
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={colors.text} size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      key={status}
      initialRouteName={status === 'authenticated' ? 'Origin' : 'Login'}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {status === 'authenticated' ? (
        <>
          <Stack.Screen component={OriginScreen} name="Origin" />
          <Stack.Screen component={DestinationScreen} name="Destination" />
          <Stack.Screen component={RouteFareScreen} name="RouteFare" />
          <Stack.Screen component={RideScreen} name="Ride" />
          <Stack.Screen component={ChatScreen} name="Chat" />
          <Stack.Screen component={RateRideScreen} name="RateRide" />
          <Stack.Screen component={AccountScreen} name="Account" />
        </>
      ) : (
        <>
          <Stack.Screen component={LoginScreen} name="Login" />
          <Stack.Screen component={VerificationScreen} name="Verification" />
          <Stack.Screen component={RegisterScreen} name="Register" />
          <Stack.Screen component={EmailRecoveryScreen} name="EmailRecovery" />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <BookingProvider>
          <RideProvider>
            <NavigationContainer theme={theme}>
              <RootNavigator />
            </NavigationContainer>
          </RideProvider>
        </BookingProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

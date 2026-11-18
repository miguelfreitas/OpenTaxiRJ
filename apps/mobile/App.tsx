import { LogBox } from 'react-native';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OriginScreen } from './src/screens/OriginScreen';
import { DestinationScreen } from './src/screens/DestinationScreen';
import { RouteFareScreen } from './src/screens/RouteFareScreen';
import { RideScreen } from './src/screens/RideScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { RateRideScreen } from './src/screens/RateRideScreen';
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

export default function App() {
  return (
    <SafeAreaProvider>
      <BookingProvider>
        <RideProvider>
          <NavigationContainer theme={theme}>
            <Stack.Navigator
              initialRouteName="Origin"
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen component={OriginScreen} name="Origin" />
              <Stack.Screen component={DestinationScreen} name="Destination" />
              <Stack.Screen component={RouteFareScreen} name="RouteFare" />
              <Stack.Screen component={RideScreen} name="Ride" />
              <Stack.Screen component={ChatScreen} name="Chat" />
              <Stack.Screen component={RateRideScreen} name="RateRide" />
            </Stack.Navigator>
          </NavigationContainer>
        </RideProvider>
      </BookingProvider>
    </SafeAreaProvider>
  );
}

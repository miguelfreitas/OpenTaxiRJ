import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PlacePicker } from './PlacePicker';
import { useBooking } from '../state/BookingContext';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Destination'>;

export function DestinationScreen({ navigation }: Props) {
  const { origin, destination, setDestination } = useBooking();

  return (
    <PlacePicker
      eyebrow="DESTINO"
      fallbackCoordinate={origin?.coordinate}
      initialPlace={destination}
      onBack={() => navigation.goBack()}
      onSubmit={(place) => {
        setDestination(place);
        navigation.navigate('RouteFare');
      }}
      secondaryPlace={origin}
      submitLabel="Ver tarifa"
      title="Definir destino"
    />
  );
}

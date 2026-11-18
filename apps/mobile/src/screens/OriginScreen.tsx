import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PlacePicker } from './PlacePicker';
import { useBooking } from '../state/BookingContext';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Origin'>;

export function OriginScreen({ navigation }: Props) {
  const { origin, setOrigin } = useBooking();

  return (
    <PlacePicker
      eyebrow="ORIGEM"
      initialPlace={origin}
      onSubmit={(place) => {
        setOrigin(place);
        navigation.navigate('Destination');
      }}
      showGps
      submitLabel="Continuar"
      title="Definir origem"
      useGpsOnMount={!origin}
    />
  );
}

import { useEffect, useRef } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PlacePicker } from './PlacePicker';
import { useAuth } from '../state/AuthContext';
import { useBooking } from '../state/BookingContext';
import type { RootStackParamList } from '../navigation/types';
import type { Place, RouteInfo } from '../types/booking';
import { decodePolyline } from '../utils/polyline';

type Props = NativeStackScreenProps<RootStackParamList, 'Origin'>;

const RECOVERABLE_STATUSES = new Set([100, 110, 111, 112]);

function racePointToPlace(
  point: { formattedAddress?: string; position?: { lat?: number; lng?: number }; latitude?: number; longitude?: number } | undefined,
  id: string,
  fallback: string,
): Place | null {
  const latitude = Number(point?.position?.lat ?? point?.latitude);
  const longitude = Number(point?.position?.lng ?? point?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const label = point?.formattedAddress?.trim() || fallback;
  return {
    id,
    label,
    shortLabel: label.split(',')[0] || fallback,
    coordinate: { latitude, longitude },
  };
}

function recoveredRoute(
  race: NonNullable<ReturnType<typeof useAuth>['profile']>['currentRace'],
): RouteInfo | null {
  if (!race) return null;
  const route = race.routeOriginDestination ?? race.routeDriverPassenger;
  const polyline = route?.polyline;
  if (!polyline) return null;
  try {
    const coordinates = decodePolyline(polyline);
    if (coordinates.length < 2) return null;
    return {
      coordinates,
      distanceMeters: Number(route?.distance?.value ?? 0),
      durationSeconds: Number(route?.duration?.value ?? 0),
      polyline,
      source: 'server',
    };
  } catch {
    return null;
  }
}

export function OriginScreen({ navigation }: Props) {
  const { origin, setOrigin, setDestination, setRoute, setFare } = useBooking();
  const { profile, clearActiveRide } = useAuth();
  const recoveredRef = useRef<string | null>(null);

  useEffect(() => {
    const race = profile?.currentRace;
    const raceId = race?.raceId;
    const statusId = Number(race?.statusId ?? profile?.statusId);
    if (!raceId || !RECOVERABLE_STATUSES.has(statusId)) {
      recoveredRef.current = null;
      return;
    }
    if (recoveredRef.current === raceId) return;
    recoveredRef.current = raceId;

    const route = race.routeOriginDestination;
    const originPlace = racePointToPlace(
      route?.origin ?? race.origin,
      `recovered-origin-${raceId}`,
      'Origem',
    );
    const destinationPlace = racePointToPlace(
      route?.destination ?? race.destination,
      `recovered-destination-${raceId}`,
      'Destino',
    );
    const routeInfo = recoveredRoute(race);
    if (originPlace) setOrigin(originPlace);
    if (destinationPlace) setDestination(destinationPlace);
    if (routeInfo) setRoute(routeInfo);
    if (race.raceDiscount || race.estimatedPrice !== undefined) {
      setFare({
        id: race.raceDiscount?.id ?? `recovered-fare-${raceId}`,
        label: race.raceDiscount?.fare ?? 'Tarifa Normal',
        flag: race.raceDiscount?.flag ?? 'Bandeira 1',
        drivers: 0,
        amount: Number(race.estimatedPrice ?? 0),
      });
    }
    clearActiveRide();
    navigation.navigate('Ride', { raceId, initialStatusId: statusId });
  }, [clearActiveRide, navigation, profile, setDestination, setFare, setOrigin, setRoute]);

  return (
    <PlacePicker
      eyebrow="ORIGEM"
      initialPlace={origin}
      onAccountPress={() => navigation.navigate('Account')}
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

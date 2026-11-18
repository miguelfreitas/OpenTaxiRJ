import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Place } from '../types/booking';

const HISTORY_KEY = 'historico_enderecos';
const MAX_HISTORY = 10;

type StoredAddress = {
  description: string;
  geometry: { location: { lat: number; lng: number } };
  favorito: boolean;
  historico: boolean;
  endereco: string;
};

function toStoredAddress(place: Place): StoredAddress {
  return {
    description: place.shortLabel,
    geometry: {
      location: {
        lat: place.coordinate.latitude,
        lng: place.coordinate.longitude,
      },
    },
    favorito: false,
    historico: true,
    endereco: place.label,
  };
}

function toPlace(item: StoredAddress): Place | null {
  const lat = Number(item?.geometry?.location?.lat);
  const lng = Number(item?.geometry?.location?.lng);
  const label = typeof item?.endereco === 'string' ? item.endereco.trim() : '';
  if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: `history-${lat.toFixed(6)},${lng.toFixed(6)}`,
    label,
    shortLabel:
      (typeof item.description === 'string' && item.description.trim()) ||
      label.split(',')[0] ||
      'Local',
    coordinate: { latitude: lat, longitude: lng },
  };
}

export async function loadAddressHistory(): Promise<Place[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => toPlace(item as StoredAddress))
      .filter((item): item is Place => Boolean(item));
  } catch {
    return [];
  }
}

export async function addAddressHistory(place: Place): Promise<Place[]> {
  const current = await loadAddressHistory();
  const normalized = place.label.trim();
  const next = [
    place,
    ...current.filter((item) => item.label.trim() !== normalized),
  ].slice(0, MAX_HISTORY);
  try {
    await AsyncStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(next.map(toStoredAddress)),
    );
  } catch {
    return current;
  }
  return next;
}

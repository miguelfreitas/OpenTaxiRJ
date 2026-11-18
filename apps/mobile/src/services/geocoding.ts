import type { Coordinate, Place } from '../types/booking';
import { formatCoordinate } from '../utils/geo';

const PHOTON_BASE = 'https://photon.komoot.io';
const RIO_BBOX = '-43.85,-23.12,-43.05,-22.75';

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, unknown>;
};

type PhotonResponse = {
  features?: PhotonFeature[];
};

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildLabel(properties: Record<string, unknown>) {
  const name = text(properties.name);
  const street = text(properties.street);
  const number = text(properties.housenumber);
  const streetLine = street && number ? `${street}, ${number}` : street;
  const city = text(properties.city);
  const state = text(properties.state);
  const parts = [name, streetLine, city, state].filter(Boolean);
  return Array.from(new Set(parts)).join(', ');
}

function featureToPlace(feature: PhotonFeature): Place | null {
  const coordinates = feature.geometry?.coordinates;
  if (!coordinates) return null;
  const properties = feature.properties ?? {};
  const label = buildLabel(properties);
  if (!label) return null;
  const shortLabel =
    text(properties.name) ||
    text(properties.street) ||
    text(properties.city) ||
    label;
  return {
    id: `${text(properties.osm_type) || 'osm'}-${text(properties.osm_id) || coordinates.join(',')}`,
    label,
    shortLabel,
    coordinate: { longitude: coordinates[0], latitude: coordinates[1] },
  };
}

export async function searchPlaces(query: string) {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  const params = [
    `q=${encodeURIComponent(trimmed)}`,
    'limit=6',
    `bbox=${RIO_BBOX}`,
  ].join('&');
  const response = await fetch(`${PHOTON_BASE}/api/?${params}`);
  if (!response.ok) throw new Error('Falha ao buscar endereços');
  const data = (await response.json()) as PhotonResponse;
  const seen = new Set<string>();
  return (data.features ?? [])
    .filter((feature) => {
      const country = text(feature.properties?.countrycode).toUpperCase();
      return !country || country === 'BR';
    })
    .map(featureToPlace)
    .filter((place): place is Place => Boolean(place))
    .filter((place) => {
      if (seen.has(place.label)) return false;
      seen.add(place.label);
      return true;
    });
}

export async function reversePlace(coordinate: Coordinate) {
  const params = [
    `lat=${coordinate.latitude}`,
    `lon=${coordinate.longitude}`,
    'limit=1',
  ].join('&');
  const response = await fetch(`${PHOTON_BASE}/reverse?${params}`);
  if (!response.ok) throw new Error('Falha ao obter o endereço');
  const data = (await response.json()) as PhotonResponse;
  const place = (data.features ?? [])
    .map(featureToPlace)
    .find((value): value is Place => Boolean(value));
  if (place) return place;
  return {
    id: `pin-${coordinate.latitude},${coordinate.longitude}`,
    label: formatCoordinate(coordinate),
    shortLabel: 'Local no mapa',
    coordinate,
  } satisfies Place;
}

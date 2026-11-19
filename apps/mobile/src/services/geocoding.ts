import type { Coordinate, Place } from '../types/booking';
import { formatCoordinate } from '../utils/geo';

const PHOTON_BASE = 'https://photon.komoot.io';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const RIO_BBOX = '-43.85,-23.12,-43.05,-22.75';
const GEO_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'OpenTaxiRJ/4.1.20',
};

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, unknown>;
};

type PhotonResponse = {
  features?: PhotonFeature[];
};

type NominatimPlace = {
  lat?: string;
  lon?: string;
  display_name?: string;
  name?: string;
  osm_type?: string;
  osm_id?: number;
  address?: Record<string, unknown>;
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
  const parts = [streetLine || name, city, state].filter(Boolean);
  return Array.from(new Set(parts)).join(', ');
}

function featureToPlace(feature: PhotonFeature): Place | null {
  const coordinates = feature.geometry?.coordinates;
  if (!coordinates) return null;
  const properties = feature.properties ?? {};
  const label = buildLabel(properties);
  if (!label) return null;
  const street = text(properties.street);
  const number = text(properties.housenumber);
  const shortLabel =
    (street && number ? `${street}, ${number}` : street) ||
    text(properties.name) ||
    text(properties.city) ||
    label;
  return {
    id: `${text(properties.osm_type) || 'osm'}-${text(properties.osm_id) || coordinates.join(',')}`,
    label,
    shortLabel,
    coordinate: { longitude: coordinates[0], latitude: coordinates[1] },
  };
}

function nominatimToPlace(item: NominatimPlace): Place | null {
  const latitude = Number(item.lat);
  const longitude = Number(item.lon);
  const label = text(item.display_name);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !label) return null;
  const address = item.address ?? {};
  const shortLabel =
    text(item.name) ||
    text(address.road) ||
    text(address.neighbourhood) ||
    text(address.suburb) ||
    text(address.city) ||
    label.split(',')[0];
  return {
    id: `nominatim-${text(item.osm_type) || 'osm'}-${item.osm_id ?? `${latitude},${longitude}`}`,
    label,
    shortLabel,
    coordinate: { latitude, longitude },
  };
}

async function photonSearch(query: string) {
  const params = [
    `q=${encodeURIComponent(query)}`,
    'limit=6',
    `bbox=${RIO_BBOX}`,
  ].join('&');
  const response = await fetch(`${PHOTON_BASE}/api/?${params}`, { headers: GEO_HEADERS });
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

async function nominatimSearch(query: string) {
  const params = [
    'format=jsonv2',
    `q=${encodeURIComponent(query)}`,
    'limit=6',
    'addressdetails=1',
    `viewbox=${RIO_BBOX}`,
    'bounded=1',
  ].join('&');
  const response = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
    headers: GEO_HEADERS,
  });
  if (!response.ok) throw new Error('Falha ao buscar endereços');
  const data = (await response.json()) as NominatimPlace[];
  return data.map(nominatimToPlace).filter((place): place is Place => Boolean(place));
}

export async function searchPlaces(query: string) {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  try {
    const places = await photonSearch(trimmed);
    if (places.length) return places;
  } catch {}
  return nominatimSearch(trimmed);
}

async function photonReverse(coordinate: Coordinate) {
  const params = [
    `lat=${coordinate.latitude}`,
    `lon=${coordinate.longitude}`,
    'limit=1',
  ].join('&');
  const response = await fetch(`${PHOTON_BASE}/reverse?${params}`, { headers: GEO_HEADERS });
  if (!response.ok) throw new Error('Falha ao obter o endereço');
  const data = (await response.json()) as PhotonResponse;
  return (data.features ?? [])
    .map(featureToPlace)
    .find((value): value is Place => Boolean(value)) ?? null;
}

async function nominatimReverse(coordinate: Coordinate) {
  const params = [
    'format=jsonv2',
    `lat=${coordinate.latitude}`,
    `lon=${coordinate.longitude}`,
    'zoom=18',
    'addressdetails=1',
  ].join('&');
  const response = await fetch(`${NOMINATIM_BASE}/reverse?${params}`, {
    headers: GEO_HEADERS,
  });
  if (!response.ok) throw new Error('Falha ao obter o endereço');
  return nominatimToPlace((await response.json()) as NominatimPlace);
}

export async function reversePlace(coordinate: Coordinate) {
  try {
    const place = await photonReverse(coordinate);
    if (place) return place;
  } catch {}
  try {
    const place = await nominatimReverse(coordinate);
    if (place) return place;
  } catch {}
  return {
    id: `pin-${coordinate.latitude},${coordinate.longitude}`,
    label: formatCoordinate(coordinate),
    shortLabel: 'Local no mapa',
    coordinate,
  } satisfies Place;
}

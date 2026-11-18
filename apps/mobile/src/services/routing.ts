import type { Coordinate, RouteInfo } from '../types/booking';
import { encodePolyline } from '../utils/polyline';
import { haversineMeters } from '../utils/geo';

type OsrmResponse = {
  routes?: Array<{
    distance: number;
    duration: number;
    geometry?: { coordinates?: [number, number][] };
  }>;
};

function fallbackRoute(origin: Coordinate, destination: Coordinate): RouteInfo {
  const distance = haversineMeters(origin, destination);
  const coordinates: [number, number][] = [
    [origin.longitude, origin.latitude],
    [destination.longitude, destination.latitude],
  ];
  return {
    distanceMeters: distance,
    durationSeconds: distance / 7.5,
    coordinates,
    polyline: encodePolyline(coordinates),
    source: 'fallback',
  };
}

export async function getDrivingRoute(origin: Coordinate, destination: Coordinate) {
  const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error('Falha ao calcular rota');
    const data = (await response.json()) as OsrmResponse;
    const route = data.routes?.[0];
    const geometry = route?.geometry?.coordinates;
    if (!route || !geometry?.length) throw new Error('Rota vazia');
    return {
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      coordinates: geometry,
      polyline: encodePolyline(geometry),
      source: 'osrm',
    } satisfies RouteInfo;
  } catch {
    return fallbackRoute(origin, destination);
  } finally {
    clearTimeout(timeout);
  }
}

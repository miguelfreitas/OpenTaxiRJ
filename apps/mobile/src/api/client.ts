import { Platform } from 'react-native';
import type { Coordinate, FareOption, Place, RouteInfo } from '../types/booking';
import { decodePolyline } from '../utils/polyline';

export const API_BASE_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:8081' : 'http://127.0.0.1:8081';
export const WS_URL = API_BASE_URL.replace(/^http/, 'ws');
export const AUTH_TOKEN = 'fake-token';

const DISCOUNT_IDS: Record<string, string> = {
  'Tarifa Normal': '59c424f09c4b6aa933bbed93',
  '10%': '59c424f09c4b6aa933bbed94',
  '20%': '59c424f09c4b6aa933bbed95',
  '30%': '59c424f09c4b6aa933bbed96',
  '40%': '59c424f09c4b6aa933bbed97',
};

type FareResponse = {
  fare?: string;
  flag?: string;
  discountId?: string;
  amountOfDrivers?: number | string;
  estimatedPrice?: string | number;
};

type RaceResponse = {
  raceId?: string;
  statusId?: number;
};

type RouteDetailsResponse = {
  polyline: string;
  distance: number;
  duration: number;
  source?: string;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  clearTimeout(timeout);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(body?.message ?? 'Falha na API fake', response.status);
  }
  return body as T;
}

function point(coordinate: Coordinate) {
  return {
    lat: coordinate.latitude,
    lng: coordinate.longitude,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
  };
}

export async function getRouteDetails(origin: Place, destination: Place) {
  const query = [
    `origin=${origin.coordinate.latitude},${origin.coordinate.longitude}`,
    `destination=${destination.coordinate.latitude},${destination.coordinate.longitude}`,
  ].join('&');
  const data = await request<RouteDetailsResponse>(`/races/getRouteDetails?${query}`);
  const coordinates = decodePolyline(data.polyline);
  if (coordinates.length < 2) throw new Error('Rota inválida recebida do servidor');
  const distanceKm = Number(data.distance);
  const duration = Number(data.duration);
  if (!Number.isFinite(distanceKm) || !Number.isFinite(duration)) {
    throw new Error('Rota inválida recebida do servidor');
  }
  return {
    distanceMeters: distanceKm * 1000,
    durationSeconds: duration,
    coordinates,
    polyline: data.polyline,
    source: data.source === 'fallback' ? 'server-fallback' : 'server',
  } satisfies RouteInfo;
}

export async function getFareOptions(
  origin: Place,
  destination: Place,
  route: RouteInfo,
) {
  const data = await request<FareResponse[]>('/races/fares', {
    method: 'POST',
    body: JSON.stringify({
      paymentId: 'money',
      associatedPaymentMethod: { pindex: 0, paymentId: 'money' },
      cityId: '1',
      route: {
        distance: route.distanceMeters,
        duration: route.durationSeconds,
        polyline: route.polyline,
        origin: point(origin.coordinate),
        destination: point(destination.coordinate),
      },
    }),
  });
  const fares = data
    .map((item) => {
      const label = item.fare || 'Tarifa Normal';
      const id = item.discountId || DISCOUNT_IDS[label];
      const amount = Number(item.estimatedPrice);
      if (!id || !Number.isFinite(amount)) return null;
      return {
        id,
        label,
        flag: item.flag || 'Bandeira 1',
        drivers: Number(item.amountOfDrivers ?? 0),
        amount,
      } satisfies FareOption;
    })
    .filter((item): item is FareOption => Boolean(item));
  if (!fares.length) throw new Error('Nenhuma tarifa disponível');
  return fares;
}

export async function createRide(
  origin: Place,
  destination: Place,
  route: RouteInfo,
  fare: FareOption,
) {
  return request<RaceResponse>('/races/create', {
    method: 'POST',
    body: JSON.stringify({
      associatedPaymentMethod: { pindex: 0, paymentId: 'money' },
      raceDiscount: { id: fare.id, fare: fare.label },
      corporateRaceJustification: null,
      city: { cityId: '1', cityName: 'Rio de Janeiro' },
      geoLocationData: {
        origin: point(origin.coordinate),
        destination: point(destination.coordinate),
      },
      routeOriginDestination: {
        distance: {
          text: `${(route.distanceMeters / 1000).toFixed(1)} km`,
          value: Math.round(route.distanceMeters),
        },
        duration: {
          text: `${Math.max(1, Math.round(route.durationSeconds / 60))} min`,
          value: Math.round(route.durationSeconds),
        },
        polyline: route.polyline,
        origin: point(origin.coordinate),
        destination: point(destination.coordinate),
      },
    }),
  });
}

export async function cancelRide() {
  return request<Record<string, never>>('/races/cancel', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}


export async function rateRide(rating: number, comment: string) {
  return request<Record<string, never>>('/races/rating', {
    method: 'POST',
    body: JSON.stringify({ ratingSelected: rating, comment }),
  });
}

export async function skipRideRating() {
  return request<Record<string, never>>('/races/notRating', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

import { Platform } from 'react-native';
import type { Coordinate, FareOption, Place, RouteInfo } from '../types/booking';
import { decodePolyline } from '../utils/polyline';
import { getClientVersion, getPassengerInfo, getSignInClientInfo } from '../services/clientInfo';

export const API_BASE_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:8081' : 'http://127.0.0.1:8081';
export const WS_URL = API_BASE_URL.replace(/^http/, 'ws');

const DISCOUNT_IDS: Record<string, string> = {
  'Tarifa Normal': '59c424f09c4b6aa933bbed93',
  '10%': '59c424f09c4b6aa933bbed94',
  '20%': '59c424f09c4b6aa933bbed95',
  '30%': '59c424f09c4b6aa933bbed96',
  '40%': '59c424f09c4b6aa933bbed97',
};

export type PassengerUser = {
  userId?: string;
  fullName: string;
  displayName: string;
  email: string;
  phoneNumber: string;
  cpf?: string;
};

export type AssociatedPaymentMethod = {
  pindex: number;
  paymentId?: string | null;
  name?: string;
};

export type PassengerProfile = {
  user?: Partial<PassengerUser>;
  city?: { cityId?: string; name?: string };
  associatedPaymentMethod?: AssociatedPaymentMethod;
};

type AuthPassengerResponse = {
  token?: string;
};

type SignInInput = {
  login: string;
  phoneNumber: string;
  smsCode: string;
  cityId?: string;
};

type MinimumVersionResponse = {
  needsUpdate?: boolean;
  message?: string;
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

let apiToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setApiToken(token: string | null) {
  apiToken = token;
}

export function getApiToken() {
  return apiToken;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

async function request<T>(path: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const hasBody = options.body !== undefined && options.body !== null;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    signal: controller.signal,
    headers: {
      ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
      PassengerInfo: JSON.stringify(getPassengerInfo()),
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      Accept: 'application/json, text/plain, */*',
      ...(options.headers ?? {}),
    },
  });
  clearTimeout(timeout);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    if (response.status === 401) unauthorizedHandler?.();
    throw new ApiError(body?.message ?? 'Falha na API fake', response.status);
  }
  return body as T;
}

export async function checkMinimumAppVersion() {
  return request<MinimumVersionResponse>(
    `/auth/checkMinimumAppVersion?currentVersion=${encodeURIComponent(getClientVersion())}`,
  );
}

export async function authPassenger(login: string, phoneNumber: string) {
  return request<AuthPassengerResponse>('/auth/authPassenger', {
    method: 'POST',
    body: JSON.stringify({ login, phoneNumber }),
  });
}

export async function signIn(input: SignInInput) {
  const data = await request<{ token?: string }>('/auth/signIn', {
    method: 'POST',
    body: JSON.stringify({
      login: input.login,
      phoneNumber: input.phoneNumber,
      smsCode: input.smsCode,
      cityId: input.cityId ?? '',
      ...getSignInClientInfo(),
    }),
  });
  if (!data.token) throw new ApiError('Token não recebido', 500);
  return data.token;
}

export async function sendNewSmsCode(phoneNumber: string) {
  return request<Record<string, never>>('/auth/sendNewSmsCode', {
    method: 'POST',
    body: JSON.stringify({ phoneNumber }),
  });
}

export async function getPassengerProfile() {
  const data = await request<PassengerProfile & { payload?: PassengerProfile }>(
    '/aboutme/aboutMePassenger',
  );
  return (data.payload ?? data) as PassengerProfile;
}

export async function updatePassengerProfile(input: {
  fullName: string;
  displayName: string;
  email: string;
  phoneNumber: string;
}) {
  return request<{ isSendedSmsCode?: boolean }>(
    '/account/updatePassengerAndUserData',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

function position(coordinate: Coordinate) {
  return {
    lat: coordinate.latitude,
    lng: coordinate.longitude,
  };
}

function paymentPayload(payment: AssociatedPaymentMethod) {
  return {
    pindex: payment.pindex,
    paymentId: payment.paymentId ?? null,
  };
}

function placePoint(place: Place) {
  return {
    formattedAddress: place.label,
    position: position(place.coordinate),
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
  payment: AssociatedPaymentMethod,
  cityId = '1',
) {
  const data = await request<FareResponse[]>('/races/fares', {
    method: 'POST',
    body: JSON.stringify({
      associatedPaymentMethod: paymentPayload(payment),
      cityId,
      destination: placePoint(destination),
      origin: placePoint(origin),
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
  payment: AssociatedPaymentMethod,
  cityId = '1',
) {
  return request<RaceResponse>('/races/create', {
    method: 'POST',
    body: JSON.stringify({
      associatedPaymentMethod: paymentPayload(payment),
      raceDiscount: { id: fare.id, fare: fare.label },
      corporateRaceJustification: null,
      city: { cityId, cityName: 'Rio de Janeiro' },
      geoLocationData: {
        origin: placePoint(origin),
        destination: placePoint(destination),
      },
      routeOriginDestination: {
        distance: {
          text: `${(route.distanceMeters / 1000).toFixed(1)} km`,
          value: Math.round(route.distanceMeters),
        },
        duration: {
          text: `${Math.max(1, Math.round(route.durationSeconds / 60))} minutos`,
          value: Math.round(route.durationSeconds),
        },
        polyline: route.polyline,
      },
    }),
  });
}

export async function cancelRide() {
  return request<Record<string, never>>('/races/cancel', {
    method: 'POST',
  });
}

export async function sendDriverMessage(raceId: string, message: string) {
  return request<Record<string, never>>('/races/sendMessageToDriver', {
    method: 'POST',
    body: JSON.stringify({ raceId, message }),
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
  });
}

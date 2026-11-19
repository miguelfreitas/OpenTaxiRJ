import type { Coordinate, FareOption, Place, RouteInfo } from '../types/booking';
import { API_BASE_URL, WS_URL } from '../config';
import { decodePolyline } from '../utils/polyline';
import { getClientVersion, getPassengerInfo, getSignInClientInfo } from '../services/clientInfo';

export { API_BASE_URL, WS_URL };

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

export type EligiblePaymentMethod = {
  pindex: number;
  name?: string;
  type?: string;
  shortName?: string;
  active?: boolean;
  paymentMethodId?: string;
};

export type PassengerProfile = {
  user?: Partial<PassengerUser>;
  city?: { cityId?: string; name?: string };
  associatedPaymentMethod?: AssociatedPaymentMethod;
  listEligiblePaymentMethodsNative?: EligiblePaymentMethod[];
};

export type AuthResult<T> = {
  status: number;
  body: T;
};

type AuthPassengerResponse = {
  token?: string;
  oldPhoneNumber?: string;
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
  body: unknown;
  raw: string | null;

  constructor(
    message: string,
    status: number,
    body: unknown = null,
    raw: string | null = null,
  ) {
    super(message);
    this.status = status;
    this.body = body;
    this.raw = raw;
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

async function requestWithStatus<T>(
  path: string,
  options: RequestInit = {},
): Promise<AuthResult<T>> {
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
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    if (response.status === 401) unauthorizedHandler?.();
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String((body as { message?: unknown }).message)
        : text.trim().slice(0, 300) || `Erro HTTP ${response.status}`;
    throw new ApiError(message, response.status, body, text);
  }
  return { status: response.status, body: body as T };
}

async function request<T>(path: string, options: RequestInit = {}) {
  const result = await requestWithStatus<T>(path, options);
  return result.body;
}

export async function checkMinimumAppVersion() {
  return request<MinimumVersionResponse>(
    `/auth/checkMinimumAppVersion?currentVersion=${encodeURIComponent(getClientVersion())}`,
  );
}

export async function authPassenger(
  login: string,
  phoneNumber: string,
  useWhatsApp = false,
) {
  return requestWithStatus<AuthPassengerResponse>('/auth/authPassenger', {
    method: 'POST',
    body: JSON.stringify({ login, phoneNumber, useWhatsApp }),
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

export async function sendNewWhatsAppCode(phoneNumber: string) {
  return request<Record<string, never>>('/auth/sendNewWhatsAppCode', {
    method: 'POST',
    body: JSON.stringify({ phoneNumber }),
  });
}

export async function verifySmsCode(
  login: string,
  phoneNumber: string,
  smsCode: string,
) {
  return requestWithStatus<Record<string, never>>('/auth/verifySmsCode', {
    method: 'POST',
    body: JSON.stringify({ login, phoneNumber, smsCode }),
  });
}

export async function signUp(input: {
  login: string;
  phoneNumber: string;
  smsCode: string;
  emailCode?: string;
  fullName: string;
  displayName: string;
}) {
  const data = await requestWithStatus<{ token?: string }>('/auth/signUp', {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      ...getSignInClientInfo(),
    }),
  });
  if (!data.body.token) {
    throw new ApiError('Resposta de cadastro sem token.', data.status, data.body);
  }
  return { status: data.status, token: data.body.token };
}

export async function sendRecoveryCode(login: string) {
  return request<Record<string, never>>('/accountrecovery/sendvalidationcode', {
    method: 'POST',
    body: JSON.stringify({ login }),
  });
}

export async function validateRecoveryCode(input: {
  login: string;
  validationCode: string;
  phoneNumber: string;
  oldPhoneNumber?: string;
}) {
  return requestWithStatus<Record<string, never>>(
    '/accountrecovery/verifyvalidationcode',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export async function getMyOriginCity(coordinate: Coordinate) {
  return request<{ cityId?: string | number; name?: string; isAbleToUsePaymentInApp?: boolean }>(
    '/aboutme/getMyOriginCity',
    {
      method: 'POST',
      body: JSON.stringify({
        lat: coordinate.latitude,
        lng: coordinate.longitude,
      }),
    },
  );
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

function farePaymentPayload(payment: AssociatedPaymentMethod) {
  const pindex = Number(payment?.pindex);
  if (!Number.isFinite(pindex) || pindex <= 0) return { pindex: 10 };
  if (pindex === 4) return { pindex, paymentId: '6' };
  return { pindex, paymentId: payment.paymentId ?? null };
}

function createPaymentPayload(payment: AssociatedPaymentMethod) {
  const pindex = Number(payment?.pindex);
  if (!Number.isFinite(pindex) || pindex <= 0) return { pindex: 1 };
  return {
    pindex,
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
      associatedPaymentMethod: farePaymentPayload(payment),
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
  if (!fares.length) throw new Error('Nenhum taxista disponível para esta forma de pagamento.');
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
      associatedPaymentMethod: createPaymentPayload(payment),
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

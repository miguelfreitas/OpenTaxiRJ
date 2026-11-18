export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type Place = {
  id: string;
  label: string;
  shortLabel: string;
  coordinate: Coordinate;
};

export type RouteInfo = {
  distanceMeters: number;
  durationSeconds: number;
  coordinates: [number, number][];
  polyline: string;
  source: 'server' | 'server-fallback' | 'osrm' | 'fallback';
};

export type FareOption = {
  id: string;
  label: string;
  flag: string;
  drivers: number;
  amount: number;
};

export type PaymentMethod = {
  id: 'money';
  label: string;
  description: string;
};

export const MONEY_PAYMENT: PaymentMethod = {
  id: 'money',
  label: 'Dinheiro',
  description: 'Pague diretamente ao motorista',
};

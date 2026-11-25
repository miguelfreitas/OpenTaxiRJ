import { Platform } from 'react-native';

const localApiBase =
  Platform.OS === 'android' ? 'http://10.0.2.2:8081' : 'http://127.0.0.1:8081';
const localRtdbBase =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:9000?ns=taxi-rio'
    : 'http://127.0.0.1:9000?ns=taxi-rio';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? localApiBase;

function websocketUrl(value: string) {
  const trimmed = value.trim().replace(/^\/\//, '');
  if (/^wss?:\/\//i.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/^http/i, 'ws');
  return `${API_BASE_URL.startsWith('https:') ? 'wss' : 'ws'}://${trimmed}`;
}

export const WS_URL = websocketUrl(
  process.env.EXPO_PUBLIC_WS_URL ?? API_BASE_URL.replace(/^http/, 'ws'),
);
export const RTDB_URL = process.env.EXPO_PUBLIC_RTDB_URL ?? localRtdbBase;
export const DRIVER_PHOTO_BASE_URL =
  process.env.EXPO_PUBLIC_DRIVER_PHOTO_BASE_URL ??
  (API_BASE_URL.startsWith('http://10.0.2.2') || API_BASE_URL.startsWith('http://127.0.0.1')
    ? `${API_BASE_URL}/google/storage/url/drivers`
    : 'https://files.apps.taxi.rio/google/storage/url/drivers');
const localRtdb =
  RTDB_URL.startsWith('http://10.0.2.2') || RTDB_URL.startsWith('http://127.0.0.1');
export const USE_FIREBASE_EMULATOR =
  (process.env.EXPO_PUBLIC_FIREBASE_EMULATOR ?? (localRtdb ? '1' : '0')) === '1';
export const RIDE_LOG_ENABLED = process.env.EXPO_PUBLIC_RIDE_LOG === '1';

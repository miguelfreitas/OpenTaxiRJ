import { NativeModules, Platform } from 'react-native';
import { RIDE_LOG_ENABLED } from '../config';

type RideLogNative = {
  append: (line: string) => void;
  getLogPath: () => Promise<string>;
  clear: () => Promise<void>;
};

const nativeLog =
  Platform.OS === 'android'
    ? (NativeModules.RideLog as RideLogNative | undefined)
    : undefined;

const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const maxString = 400_000;
const redactedKeys =
  /^(authorization|token|apitoken|accesstoken|refreshtoken|password|smscode|emailcode|validationcode)$/i;

let sequence = 0;

function truncate(value: string) {
  return value.length > maxString
    ? `${value.slice(0, maxString)}…<truncated ${value.length - maxString} chars>`
    : value;
}

function clean(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return truncate(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth > 8) return '<depth limit>';
  if (seen.has(value)) return '<circular>';
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ? truncate(value.stack) : undefined,
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 500).map((item) => clean(item, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = redactedKeys.test(key) ? '<redacted>' : clean(item, depth + 1, seen);
  }
  return out;
}

function write(event: string, data?: unknown) {
  if (!RIDE_LOG_ENABLED) return;
  const entry = {
    t: new Date().toISOString(),
    ms: Date.now(),
    seq: ++sequence,
    session: sessionId,
    event,
    data: clean(data),
  };
  const line = JSON.stringify(entry);
  if (nativeLog) {
    nativeLog.append(line);
  } else {
    console.log(`[RideLog] ${line}`);
  }
}

export const rideLog = {
  event: write,
  apiRequest(method: string, path: string) {
    write('api.request', { method, path });
  },
  apiResponse(
    method: string,
    path: string,
    status: number,
    durationMs: number,
    body: unknown,
  ) {
    write('api.response', { method, path, status, durationMs, body });
  },
  apiError(
    method: string,
    path: string,
    durationMs: number,
    error: unknown,
    status?: number,
  ) {
    write('api.error', { method, path, durationMs, status, error });
  },
  ws(event: string, data?: unknown) {
    write(`ws.${event}`, data);
  },
  wsMessage(raw: string, data?: unknown) {
    write('ws.message', {
      bytes: raw.length,
      raw: truncate(raw),
      ...(data && typeof data === 'object' ? { summary: data } : {}),
    });
  },
  driver(source: string, driver: unknown, extra?: unknown) {
    write('driver.snapshot', { source, driver, extra });
  },
  rideState(source: string, state: unknown) {
    write('ride.state', { source, state });
  },
  profile(source: string, profile: unknown) {
    write('profile.snapshot', { source, profile });
  },
  error(source: string, error: unknown) {
    write('error', { source, error });
  },
};

export async function initRideLog(meta: Record<string, unknown>) {
  if (!RIDE_LOG_ENABLED) return null;
  let path: string | null = null;
  if (nativeLog) {
    try {
      path = await nativeLog.getLogPath();
    } catch {
      path = null;
    }
  }
  write('app.start', { ...meta, session: sessionId, path });
  return path;
}

export async function getRideLogPath() {
  if (!RIDE_LOG_ENABLED || !nativeLog) return null;
  return nativeLog.getLogPath();
}

export async function clearRideLog() {
  if (!RIDE_LOG_ENABLED || !nativeLog) return;
  await nativeLog.clear();
}

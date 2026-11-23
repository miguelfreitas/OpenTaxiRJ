import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getApiToken, getDriverPhotoUrl, WS_URL, type DriverPayload } from '../api/client';
import { useAuth } from './AuthContext';
import type { Coordinate, RouteInfo } from '../types/booking';
import { decodePolyline } from '../utils/polyline';

export type RideStage = 'idle' | 'finding' | 'waiting' | 'in_race' | 'finished';
export type RideConnection = 'idle' | 'connecting' | 'open' | 'closed';

export type RideDriver = DriverPayload;

type RideContextValue = {
  stage: RideStage;
  statusId: number | null;
  connection: RideConnection;
  driver: RideDriver | null;
  driverPosition: Coordinate | null;
  driverPhotoUrl: string | null;
  liveRoute: RouteInfo | null;
  start: (raceId: string, initialStatusId?: number) => void;
  stop: () => void;
};

const RideContext = createContext<RideContextValue | null>(null);

type WsSocket = {
  close: () => void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
};

type WsConstructor = new (
  url: string,
  protocols?: string[],
  options?: { headers?: Record<string, string> },
) => WsSocket;

type RoutePayload = {
  polyline?: string;
  distance?: { value?: number };
  duration?: { value?: number };
};

type Point = { lat?: number; lng?: number; latitude?: number; longitude?: number };

function coordinateFromPoint(point: Point | null | undefined): Coordinate | null {
  if (!point) return null;
  const latitude = Number(point.lat ?? point.latitude);
  const longitude = Number(point.lng ?? point.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function routeFromPayload(
  payload: RoutePayload | undefined,
  durationMultiplier = 1,
): RouteInfo | null {
  if (!payload?.polyline) return null;
  const coordinates = decodePolyline(payload.polyline);
  if (coordinates.length < 2) return null;
  const distanceMeters = Number(payload.distance?.value ?? 0);
  const durationSeconds = Number(payload.duration?.value ?? 0) * durationMultiplier;
  if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationSeconds)) return null;
  return {
    distanceMeters,
    durationSeconds,
    coordinates,
    polyline: payload.polyline,
    source: 'server',
  };
}

function stageFor(statusId: number): RideStage | null {
  if (statusId === 100 || statusId === 110) return 'finding';
  if (statusId === 111) return 'waiting';
  if (statusId === 112) return 'in_race';
  if (statusId === 113 || statusId === 114) return 'finished';
  if (statusId === 103) return 'idle';
  return null;
}

export function RideProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<WsSocket | null>(null);
  const [stage, setStage] = useState<RideStage>('idle');
  const [statusId, setStatusId] = useState<number | null>(null);
  const [connection, setConnection] = useState<RideConnection>('idle');
  const [driver, setDriver] = useState<RideDriver | null>(null);
  const [driverPosition, setDriverPosition] = useState<Coordinate | null>(null);
  const [driverPhotoUrl, setDriverPhotoUrl] = useState<string | null>(null);
  const [liveRoute, setLiveRoute] = useState<RouteInfo | null>(null);
  const { profile } = useAuth();

  const stop = useCallback(() => {
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
    }
    setConnection('idle');
    setDriverPosition(null);
    setLiveRoute(null);
  }, []);

  const start = useCallback(
    (_raceId: string, initialStatusId?: number) => {
      stop();
      const initialStage = initialStatusId ? stageFor(initialStatusId) : null;
      setStage(initialStage ?? 'finding');
      setStatusId(initialStatusId ?? 100);
      setDriver(null);
      setDriverPosition(null);
      setDriverPhotoUrl(null);
      setLiveRoute(null);
      setConnection('connecting');

      const token = getApiToken();
      if (!token) {
        setConnection('closed');
        return;
      }

      const WebSocketCtor = WebSocket as unknown as WsConstructor;
      let socket: WsSocket;
      try {
        socket = new WebSocketCtor(WS_URL, [], {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        setConnection('closed');
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        setConnection('open');
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as {
            statusId?: number;
            payload?: {
              driver?: RideDriver & { position?: Point; addressAcceptedRace?: Point };
              currentRace?: {
                driver?: RideDriver;
                routeDriverPassenger?: RoutePayload;
                routeOriginDestination?: RoutePayload;
              };
              routeDriverPassenger?: RoutePayload;
              routeOriginDestination?: RoutePayload;
              position?: Point;
              polyline?: string;
              distance?: number;
              duration?: number;
            };
          };
          const nextStatus = Number(message.statusId);
          if (!Number.isFinite(nextStatus)) return;
          const payload = message.payload;
          setStatusId(nextStatus);
          const nextStage = stageFor(nextStatus);
          if (nextStage) setStage(nextStage);
          const nextDriver = payload?.driver ?? payload?.currentRace?.driver;
          if (nextDriver) setDriver(nextDriver);
          const nextPosition =
            nextStatus === 111
              ? coordinateFromPoint(nextDriver?.addressAcceptedRace) ??
                coordinateFromPoint(payload?.position ?? payload?.driver?.position)
              : coordinateFromPoint(payload?.position ?? payload?.driver?.position);
          if (nextPosition) setDriverPosition(nextPosition);
          if (nextStatus === 111) {
            const nextRoute = routeFromPayload(
              payload?.routeDriverPassenger ??
                payload?.currentRace?.routeDriverPassenger,
            );
            if (nextRoute) setLiveRoute(nextRoute);
          } else if (nextStatus === 112) {
            const nextRoute = routeFromPayload(
              payload?.routeOriginDestination ??
                payload?.currentRace?.routeOriginDestination,
            );
            if (nextRoute) setLiveRoute(nextRoute);
          } else if (nextStatus === 213) {
            const nextRoute = routeFromPayload(
              {
                polyline: payload?.polyline,
                distance: { value: payload?.distance },
                duration: { value: payload?.duration },
              },
              60,
            );
            if (nextRoute) setLiveRoute(nextRoute);
          }
        } catch {
          return;
        }
      };

      socket.onerror = () => {
        setConnection('closed');
      };

      socket.onclose = () => {
        if (socketRef.current === socket) {
          setConnection('closed');
        }
      };
    },
    [stop],
  );

  const driverId = driver?.taxiDriverId ?? driver?.driverId;
  const cityId = profile?.currentRace?.city?.cityId ?? profile?.city?.cityId ?? '1';

  useEffect(() => {
    let active = true;
    setDriverPhotoUrl(null);
    if (!driverId) return () => { active = false; };
    void getDriverPhotoUrl(cityId, driverId).then((url) => {
      if (active) setDriverPhotoUrl(url);
    });
    return () => {
      active = false;
    };
  }, [cityId, driverId]);

  useEffect(() => stop, [stop]);

  const value = useMemo(
    () => ({
      stage,
      statusId,
      connection,
      driver,
      driverPosition,
      driverPhotoUrl,
      liveRoute,
      start,
      stop,
    }),
    [stage, statusId, connection, driver, driverPosition, driverPhotoUrl, liveRoute, start, stop],
  );

  return <RideContext.Provider value={value}>{children}</RideContext.Provider>;
}

export function useRide() {
  const value = useContext(RideContext);
  if (!value) throw new Error('useRide must be used inside RideProvider');
  return value;
}

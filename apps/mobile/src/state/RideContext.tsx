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
import { getApiToken, WS_URL } from '../api/client';
import type { Coordinate, RouteInfo } from '../types/booking';
import { decodePolyline } from '../utils/polyline';

export type RideStage = 'idle' | 'finding' | 'waiting' | 'in_race' | 'finished';
export type RideConnection = 'idle' | 'connecting' | 'open' | 'closed';

export type RideDriver = {
  name?: string;
  carModel?: string;
  carPlate?: string;
  taxiDriverId?: string;
  driverId?: string;
};

type RideContextValue = {
  stage: RideStage;
  statusId: number | null;
  connection: RideConnection;
  driver: RideDriver | null;
  driverPosition: Coordinate | null;
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
  const [liveRoute, setLiveRoute] = useState<RouteInfo | null>(null);

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
              driver?: RideDriver & { position?: { lat?: number; lng?: number } };
              currentRace?: { driver?: RideDriver };
              position?: { lat?: number; lng?: number };
              polyline?: string;
              distance?: number;
              duration?: number;
            };
          };
          const nextStatus = Number(message.statusId);
          if (!Number.isFinite(nextStatus)) return;
          setStatusId(nextStatus);
          const nextStage = stageFor(nextStatus);
          if (nextStage) setStage(nextStage);
          const nextDriver =
            message.payload?.driver ?? message.payload?.currentRace?.driver;
          if (nextDriver) setDriver(nextDriver);
          const nextPosition =
            message.payload?.position ?? message.payload?.driver?.position;
          if (
            nextPosition &&
            Number.isFinite(Number(nextPosition.lat)) &&
            Number.isFinite(Number(nextPosition.lng))
          ) {
            setDriverPosition({
              latitude: Number(nextPosition.lat),
              longitude: Number(nextPosition.lng),
            });
          }
          if (nextStatus === 213 && message.payload?.polyline) {
            const coordinates = decodePolyline(message.payload.polyline);
            if (coordinates.length > 1) {
              setLiveRoute({
                distanceMeters: Number(message.payload.distance ?? 0) * 1000,
                durationSeconds: Number(message.payload.duration ?? 0) * 60,
                coordinates,
                polyline: message.payload.polyline,
                source: 'server',
              });
            }
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

  useEffect(() => stop, [stop]);

  const value = useMemo(
    () => ({
      stage,
      statusId,
      connection,
      driver,
      driverPosition,
      liveRoute,
      start,
      stop,
    }),
    [stage, statusId, connection, driver, driverPosition, liveRoute, start, stop],
  );

  return <RideContext.Provider value={value}>{children}</RideContext.Provider>;
}

export function useRide() {
  const value = useContext(RideContext);
  if (!value) throw new Error('useRide must be used inside RideProvider');
  return value;
}

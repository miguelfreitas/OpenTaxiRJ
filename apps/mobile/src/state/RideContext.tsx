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
import { AppState } from 'react-native';
import { getApiToken, getDriverPhotoUrl, WS_URL, type DriverPayload } from '../api/client';
import { useAuth } from './AuthContext';
import type { Coordinate, RouteInfo } from '../types/booking';
import { decodePolyline } from '../utils/polyline';
import { parseBRL } from '../utils/money';
import { rideLog } from '../services/rideLog';

export type RideStage = 'idle' | 'finding' | 'waiting' | 'in_race' | 'finished';
export type RideConnection = 'idle' | 'connecting' | 'open' | 'closed';

export type RideDriver = DriverPayload;

export type RideFinalFare = {
  total: number | null;
  discount: number | null;
  priceToPay: number | null;
  discountLabel: string | null;
  paymentLabel: string | null;
  tolls: number | null;
};

type RideContextValue = {
  stage: RideStage;
  statusId: number | null;
  connection: RideConnection;
  driver: RideDriver | null;
  driverPosition: Coordinate | null;
  driverPhotoUrl: string | null;
  liveRoute: RouteInfo | null;
  finalFare: RideFinalFare | null;
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

type Point = { lat?: number | string; lng?: number | string; latitude?: number | string; longitude?: number | string };

type FarePayload = {
  total?: unknown;
  discount?: unknown;
  discountValue?: unknown;
  priceToPay?: unknown;
  raceDiscount?: { fare?: string; flag?: string };
  associatedPaymentMethod?: { name?: string; pindex?: number };
  tolls?: unknown;
};

type CurrentRace = FarePayload & {
  raceId?: string;
  statusId?: number;
  driver?: RideDriver;
  routeDriverPassenger?: RoutePayload;
  routeOriginDestination?: RoutePayload;
};

type RideMessage = {
  statusId?: number;
  payload?: FarePayload & {
    driver?: RideDriver & { position?: Point; addressAcceptedRace?: Point };
    currentRace?: CurrentRace;
    routeDriverPassenger?: RoutePayload;
    routeOriginDestination?: RoutePayload;
    position?: Point;
    polyline?: string;
    distance?: number;
    duration?: number;
  };
};

function finalFareFrom(payload: FarePayload | null | undefined): RideFinalFare | null {
  if (!payload) return null;
  const total = parseBRL(payload.total);
  const discount = parseBRL(payload.discount);
  const priceToPay = parseBRL(payload.priceToPay);
  if (total === null && discount === null && priceToPay === null) return null;
  const tolls = Array.isArray(payload.tolls)
    ? payload.tolls.reduce<number | null>((sum, item) => {
        const value =
          typeof item === 'number'
            ? item
            : item && typeof item === 'object'
              ? parseBRL((item as { value?: unknown }).value)
              : null;
        return value === null ? sum : (sum ?? 0) + value;
      }, null)
    : null;
  return {
    total,
    discount,
    priceToPay,
    discountLabel: payload.raceDiscount?.fare?.trim() || null,
    paymentLabel: payload.associatedPaymentMethod?.name?.trim() || null,
    tolls,
  };
}

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
  distanceMultiplier = 1,
): RouteInfo | null {
  if (!payload?.polyline) return null;
  const coordinates = decodePolyline(payload.polyline);
  if (coordinates.length < 2) return null;
  const distanceMeters = Number(payload.distance?.value ?? 0) * distanceMultiplier;
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
  const connectRef = useRef<(raceId: string, attempt: number) => void>(() => undefined);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconcileSeqRef = useRef(0);
  const raceIdRef = useRef<string | null>(null);
  const driverShapeRef = useRef('');

  const [stage, setStage] = useState<RideStage>('idle');
  const [statusId, setStatusId] = useState<number | null>(null);
  const [connection, setConnection] = useState<RideConnection>('idle');
  const connectionRef = useRef(connection);
  connectionRef.current = connection;
  const [driver, setDriver] = useState<RideDriver | null>(null);
  const [driverPosition, setDriverPosition] = useState<Coordinate | null>(null);
  const [driverPhotoUrl, setDriverPhotoUrl] = useState<string | null>(null);
  const [liveRoute, setLiveRoute] = useState<RouteInfo | null>(null);
  const [finalFare, setFinalFare] = useState<RideFinalFare | null>(null);
  const { profile, refreshProfile } = useAuth();
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const statusRef = useRef(statusId);
  statusRef.current = statusId;
  const driverPositionRef = useRef(driverPosition);
  driverPositionRef.current = driverPosition;
  const liveRouteRef = useRef(liveRoute);
  liveRouteRef.current = liveRoute;

  const clearReconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const clearWatchdog = useCallback(() => {
    if (watchdogTimerRef.current) {
      clearInterval(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    if (raceIdRef.current) rideLog.event('ride.stop', { raceId: raceIdRef.current });
    raceIdRef.current = null;
    clearReconnect();
    clearWatchdog();
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
    setStage('idle');
    setStatusId(null);
    setDriverPosition(null);
    setLiveRoute(null);
  }, [clearReconnect, clearWatchdog]);

  const applyRace = useCallback((race: CurrentRace, force = false) => {
    const nextStatus = Number(race.statusId ?? 100);
    const sameStatus = statusRef.current === nextStatus;
    if (Number.isFinite(nextStatus)) {
      setStatusId(nextStatus);
      const nextStage = stageFor(nextStatus);
      if (nextStage) setStage(nextStage);
    }
    if (race.driver) {
      const shape = Object.keys(race.driver).sort().join(',');
      if (shape !== driverShapeRef.current) {
        driverShapeRef.current = shape;
        rideLog.driver('profile.shape', race.driver, {
          raceId: race.raceId,
          statusId: nextStatus,
          shape,
        });
      }
      setDriver((current) => ({ ...current, ...race.driver }));
      const position =
        coordinateFromPoint(race.driver.addressAcceptedRace) ??
        coordinateFromPoint(race.driver.position);
      if (position && (force || !sameStatus || !driverPositionRef.current)) {
        setDriverPosition(position);
      }
    }
    const route =
      nextStatus === 111
        ? race.routeDriverPassenger ?? race.routeOriginDestination
        : race.routeOriginDestination ?? race.routeDriverPassenger;
    const nextRoute = routeFromPayload(route);
    if (nextRoute && (force || !sameStatus || !liveRouteRef.current)) {
      setLiveRoute(nextRoute);
    }
    if (nextStatus === 113 || nextStatus === 114) {
      const fare = finalFareFrom(race);
      if (fare) setFinalFare(fare);
    }
    if (nextStatus === 103) {
      setDriverPosition(null);
      setLiveRoute(null);
    }
  }, []);

  const reconcileProfile = useCallback(
    async (raceId: string) => {
      const seq = reconcileSeqRef.current + 1;
      reconcileSeqRef.current = seq;
      try {
        const nextProfile = await refreshProfile();
        if (seq !== reconcileSeqRef.current || raceIdRef.current !== raceId) return;
        const race = nextProfile?.currentRace;
        rideLog.event('profile.reconcile', {
          raceId,
          found: Boolean(race),
          foundRaceId: race?.raceId ?? null,
          statusId: race?.statusId ?? null,
          hasDriver: Boolean(race?.driver),
        });
        if (!race) {
          setStage('idle');
          setStatusId(103);
          return;
        }
        if (race.raceId && race.raceId !== raceId) return;
        applyRace(race);
      } catch {
        return;
      }
    },
    [applyRace, refreshProfile],
  );

  const startWatchdog = useCallback(
    (raceId: string) => {
      clearWatchdog();
      watchdogTimerRef.current = setInterval(() => {
        if (raceIdRef.current !== raceId) return;
        if (stageRef.current === 'idle' || stageRef.current === 'finished') return;
        void reconcileProfile(raceId);
      }, 30000);
    },
    [clearWatchdog, reconcileProfile],
  );

  const connect = useCallback(
    (raceId: string, attempt: number) => {
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
      setConnection('connecting');
      rideLog.ws('connecting', { raceId, attempt, url: WS_URL });

      socket.onopen = () => {
        if (socketRef.current !== socket) return;
        rideLog.ws('open', { raceId, attempt });
        setConnection('open');
        void reconcileProfile(raceId);
      };

      socket.onmessage = (event) => {
        const raw = typeof event.data === 'string' ? event.data : String(event.data);
        rideLog.wsMessage(raw, { raceId, attempt });
        try {
          const message = JSON.parse(raw) as RideMessage;
          const payload = message.payload;
          const currentRace = payload?.currentRace;
          if (currentRace?.raceId && currentRace.raceId !== raceIdRef.current) return;
          const rawStatus = Number(message.statusId);
          if (!Number.isFinite(rawStatus)) return;
          if (rawStatus === 105) {
            void reconcileProfile(raceId);
            return;
          }
          const currentStatus = Number(currentRace?.statusId ?? rawStatus);
          const nextStatus =
            (rawStatus === 100 || rawStatus === 110) &&
            Number.isFinite(currentStatus) &&
            currentStatus > 100
              ? currentStatus
              : rawStatus;
          setStatusId(nextStatus);
          const nextStage = stageFor(nextStatus);
          if (nextStage) setStage(nextStage);
          const nextDriver = payload?.driver ?? currentRace?.driver;
          if (nextDriver) {
            const shape = Object.keys(nextDriver).sort().join(',');
            if (shape !== driverShapeRef.current) {
              driverShapeRef.current = shape;
              rideLog.driver('ws.shape', nextDriver, {
                raceId,
                statusId: nextStatus,
                currentRaceId: currentRace?.raceId ?? null,
                shape,
              });
            }
            setDriver((current) => ({ ...current, ...nextDriver }));
          }
          const nextPosition =
            nextStatus === 111
              ? coordinateFromPoint(nextDriver?.addressAcceptedRace) ??
                coordinateFromPoint(currentRace?.driver?.addressAcceptedRace) ??
                coordinateFromPoint(payload?.position ?? payload?.driver?.position)
              : coordinateFromPoint(
                  payload?.position ??
                    payload?.driver?.position ??
                    currentRace?.driver?.position,
                );
          if (nextPosition) setDriverPosition(nextPosition);
          if (nextStatus === 111) {
            const nextRoute = routeFromPayload(
              payload?.routeDriverPassenger ?? currentRace?.routeDriverPassenger,
            );
            if (nextRoute) setLiveRoute(nextRoute);
          } else if (nextStatus === 112) {
            const nextRoute = routeFromPayload(
              payload?.routeOriginDestination ?? currentRace?.routeOriginDestination,
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
              1000,
            );
            if (nextRoute) setLiveRoute(nextRoute);
          } else if (nextStatus === 100 || nextStatus === 110) {
            const nextRoute = routeFromPayload(
              currentRace?.routeDriverPassenger ?? currentRace?.routeOriginDestination,
            );
            if (nextRoute) setLiveRoute(nextRoute);
          }
          if (nextStatus === 103) {
            setDriverPosition(null);
            setLiveRoute(null);
          }
          if (nextStatus === 113 || nextStatus === 114) {
            const fare = finalFareFrom(payload) ?? finalFareFrom(currentRace);
            if (fare) setFinalFare(fare);
          }
          rideLog.rideState('ws', {
            raceId,
            statusId: nextStatus,
            stage: stageFor(nextStatus),
            hasDriver: Boolean(nextDriver),
            position: nextPosition,
            hasRoute: Boolean(
              payload?.routeDriverPassenger ??
                currentRace?.routeDriverPassenger ??
                payload?.routeOriginDestination ??
                currentRace?.routeOriginDestination,
            ),
          });
        } catch (error) {
          rideLog.ws('parse_error', { raceId, attempt, raw, error });
          return;
        }
      };

      socket.onerror = () => {
        rideLog.ws('error', { raceId, attempt });
        if (socketRef.current === socket) setConnection('closed');
      };

      socket.onclose = () => {
        if (socketRef.current !== socket) return;
        setConnection('closed');
        clearReconnect();
        const delay = Math.min(1000 * 2 ** Math.min(attempt, 6), 10000);
        rideLog.ws('close', { raceId, attempt, reconnectInMs: delay });
        reconnectTimerRef.current = setTimeout(() => {
          if (socketRef.current === socket) connectRef.current(raceId, attempt + 1);
        }, delay);
        void reconcileProfile(raceId);
      };
    },
    [clearReconnect, reconcileProfile],
  );
  connectRef.current = connect;

  const start = useCallback(
    (raceId: string, initialStatusId?: number) => {
      rideLog.event('ride.start', { raceId, initialStatusId });
      stop();
      raceIdRef.current = raceId;
      startWatchdog(raceId);
      const initialStage = initialStatusId ? stageFor(initialStatusId) : null;
      setStage(initialStage ?? 'finding');
      setStatusId(initialStatusId ?? 100);
      driverShapeRef.current = '';
      setDriver(null);
      setDriverPosition(null);
      setDriverPhotoUrl(null);
      setLiveRoute(null);
      setFinalFare(null);
      setConnection('connecting');

      const recovered = profileRef.current?.currentRace;
      if (recovered?.raceId === raceId) applyRace(recovered, true);

      connect(raceId, 0);
    },
    [applyRace, connect, startWatchdog, stop],
  );

  const driverId = driver?.taxiDriverId ?? driver?.driverId;
  const cityId = profile?.currentRace?.city?.cityId ?? profile?.city?.cityId ?? '1';

  useEffect(() => {
    let active = true;
    setDriverPhotoUrl(null);
    if (!driverId) {
      return () => {
        active = false;
      };
    }
    void getDriverPhotoUrl(cityId, driverId).then((url) => {
      if (active) setDriverPhotoUrl(url);
    });
    return () => {
      active = false;
    };
  }, [cityId, driverId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const raceId = raceIdRef.current;
      rideLog.event('app.active', { raceId, connection: connectionRef.current });
      if (nextState !== 'active' || !raceId) return;
      if (connectionRef.current === 'closed') connectRef.current(raceId, 0);
      void reconcileProfile(raceId);
    });
    return () => subscription.remove();
  }, [reconcileProfile]);

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
      finalFare,
      start,
      stop,
    }),
    [
      stage,
      statusId,
      connection,
      driver,
      driverPosition,
      driverPhotoUrl,
      liveRoute,
      finalFare,
      start,
      stop,
    ],
  );

  return <RideContext.Provider value={value}>{children}</RideContext.Provider>;
}

export function useRide() {
  const value = useContext(RideContext);
  if (!value) throw new Error('useRide must be used inside RideProvider');
  return value;
}

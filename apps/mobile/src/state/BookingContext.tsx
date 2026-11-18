import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { FareOption, Place, RouteInfo } from '../types/booking';

type BookingContextValue = {
  origin: Place | null;
  destination: Place | null;
  route: RouteInfo | null;
  fare: FareOption | null;
  setOrigin: (place: Place | null) => void;
  setDestination: (place: Place | null) => void;
  setRoute: (route: RouteInfo | null) => void;
  setFare: (fare: FareOption | null) => void;
  reset: () => void;
};

const BookingContext = createContext<BookingContextValue | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [fare, setFare] = useState<FareOption | null>(null);

  const value = useMemo(
    () => ({
      origin,
      destination,
      route,
      fare,
      setOrigin,
      setDestination,
      setRoute,
      setFare,
      reset: () => {
        setOrigin(null);
        setDestination(null);
        setRoute(null);
        setFare(null);
      },
    }),
    [origin, destination, route, fare],
  );

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking() {
  const value = useContext(BookingContext);
  if (!value) throw new Error('useBooking must be used inside BookingProvider');
  return value;
}

export type RootStackParamList = {
  Login: undefined;
  Verification: { login: string; phoneNumber: string };
  Origin: undefined;
  Destination: undefined;
  RouteFare: undefined;
  Ride: { raceId: string };
  Chat: { raceId: string };
  RateRide: { raceId: string };
  Account: undefined;
};

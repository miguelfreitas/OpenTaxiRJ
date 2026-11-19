export type RootStackParamList = {
  Login: undefined;
  Verification: { login: string; phoneNumber: string; cod?: number };
  Register: { login: string; phoneNumber: string; smsCode: string };
  EmailRecovery: { login: string; phoneNumber: string; oldPhoneNumber?: string };
  Origin: undefined;
  Destination: undefined;
  RouteFare: undefined;
  Ride: { raceId: string };
  Chat: { raceId: string };
  RateRide: { raceId: string };
  Account: undefined;
};

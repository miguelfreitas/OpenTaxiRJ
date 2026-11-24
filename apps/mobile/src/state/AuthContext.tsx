import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ApiError,
  checkMinimumAppVersion,
  getPassengerProfile,
  setApiToken,
  setUnauthorizedHandler,
  signIn as signInRequest,
  signUp as signUpRequest,
  updatePassengerProfile,
  type PassengerProfile,
  type PassengerUser,
} from '../api/client';
import {
  clearStoredToken,
  loadStoredToken,
  saveStoredToken,
} from '../services/authStorage';
import { clearAddressHistory } from '../services/addressHistory';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

type CompleteLoginInput = {
  login: string;
  phoneNumber: string;
  smsCode?: string;
  emailCode?: string;
};

type CompleteSignUpInput = CompleteLoginInput & {
  smsCode: string;
  fullName: string;
  displayName: string;
};

type ProfileUpdate = {
  fullName: string;
  displayName: string;
  email: string;
  phoneNumber: string;
};

type AuthContextValue = {
  status: AuthStatus;
  user: PassengerUser | null;
  profile: PassengerProfile | null;
  completeLogin: (input: CompleteLoginInput) => Promise<void>;
  completeSignUp: (input: CompleteSignUpInput) => Promise<void>;
  refreshProfile: () => Promise<PassengerProfile | null>;
  clearActiveRide: () => void;
  updateProfile: (input: ProfileUpdate) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<PassengerUser | null>(null);
  const [profile, setProfile] = useState<PassengerProfile | null>(null);

  const signOut = useCallback(async () => {
    await clearStoredToken();
    await clearAddressHistory();
    setApiToken(null);
    setUser(null);
    setProfile(null);
    setStatus('anonymous');
  }, []);

  const refreshProfile = useCallback(async () => {
    const nextProfile = await getPassengerProfile();
    const nextUser = (nextProfile.user ?? null) as PassengerUser | null;
    setProfile(nextProfile);
    if (nextUser) {
      setUser((current) => (current ? { ...current, ...nextUser } : nextUser));
    }
    return nextProfile;
  }, []);

  const clearActiveRide = useCallback(() => {
    setProfile((current) => (current ? { ...current, currentRace: null } : current));
  }, []);

  useEffect(() => {
    void checkMinimumAppVersion().catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;

    const restore = async () => {
      const token = await loadStoredToken();
      if (!active) return;
      if (!token) {
        setStatus('anonymous');
        return;
      }

      setApiToken(token);
      setStatus('authenticated');
      try {
        const nextProfile = await getPassengerProfile();
        if (active) {
          setProfile(nextProfile);
          setUser((nextProfile.user ?? null) as PassengerUser | null);
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await clearStoredToken();
          if (active) {
            setApiToken(null);
            setUser(null);
            setProfile(null);
            setStatus('anonymous');
          }
        }
      }
    };

    void restore();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  const completeSession = useCallback(async (token: string) => {
    await saveStoredToken(token);
    setApiToken(token);
    setStatus('authenticated');
    try {
      const nextProfile = await getPassengerProfile();
      setProfile(nextProfile);
      setUser((nextProfile.user ?? null) as PassengerUser | null);
    } catch {
      // The session is valid even if the optional profile refresh fails.
    }
  }, []);

  const completeLogin = useCallback(
    async (input: CompleteLoginInput) => {
      const token = await signInRequest(input);
      await completeSession(token);
    },
    [completeSession],
  );

  const completeSignUp = useCallback(
    async (input: CompleteSignUpInput) => {
      const result = await signUpRequest(input);
      await completeSession(result.token);
    },
    [completeSession],
  );

  const updateProfile = useCallback(async (input: ProfileUpdate) => {
    await updatePassengerProfile(input);
    setUser((current) => ({ ...current, ...input }));
    setProfile((current) =>
      current ? { ...current, user: { ...current.user, ...input } } : current,
    );
  }, []);

  const value = useMemo(
    () => ({
      status,
      user,
      profile,
      completeLogin,
      completeSignUp,
      refreshProfile,
      clearActiveRide,
      updateProfile,
      signOut,
    }),
    [
      status,
      user,
      profile,
      completeLogin,
      completeSignUp,
      refreshProfile,
      clearActiveRide,
      updateProfile,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

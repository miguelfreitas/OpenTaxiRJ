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
  getPassengerProfile,
  setApiToken,
  setUnauthorizedHandler,
  signIn as signInRequest,
  updatePassengerProfile,
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
  smsCode: string;
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
  completeLogin: (input: CompleteLoginInput) => Promise<void>;
  refreshProfile: () => Promise<PassengerUser | null>;
  updateProfile: (input: ProfileUpdate) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<PassengerUser | null>(null);

  const signOut = useCallback(async () => {
    await clearStoredToken();
    await clearAddressHistory();
    setApiToken(null);
    setUser(null);
    setStatus('anonymous');
  }, []);

  const refreshProfile = useCallback(async () => {
    const profile = await getPassengerProfile();
    const nextUser = (profile.user ?? null) as PassengerUser | null;
    if (nextUser) {
      setUser((current) => (current ? { ...current, ...nextUser } : nextUser));
    }
    return nextUser;
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
        const profile = await getPassengerProfile();
        if (active) setUser((profile.user ?? null) as PassengerUser | null);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await clearStoredToken();
          if (active) {
            setApiToken(null);
            setUser(null);
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

  const completeLogin = useCallback(async (input: CompleteLoginInput) => {
    const token = await signInRequest(input);
    await saveStoredToken(token);
    setApiToken(token);
    setStatus('authenticated');
    try {
      const profile = await getPassengerProfile();
      setUser((profile.user ?? null) as PassengerUser | null);
    } catch {
      // The session is valid even if the optional profile refresh fails.
    }
  }, []);

  const updateProfile = useCallback(async (input: ProfileUpdate) => {
    await updatePassengerProfile(input);
    setUser((current) => ({ ...current, ...input }));
  }, []);

  const value = useMemo(
    () => ({
      status,
      user,
      completeLogin,
      refreshProfile,
      updateProfile,
      signOut,
    }),
    [status, user, completeLogin, refreshProfile, updateProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

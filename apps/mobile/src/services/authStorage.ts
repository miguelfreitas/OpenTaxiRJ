import AsyncStorage from '@react-native-async-storage/async-storage';

export const AUTH_TOKEN_KEY = 'authToken';

export function loadStoredToken() {
  return AsyncStorage.getItem(AUTH_TOKEN_KEY);
}

export function saveStoredToken(token: string) {
  return AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearStoredToken() {
  return AsyncStorage.removeItem(AUTH_TOKEN_KEY);
}

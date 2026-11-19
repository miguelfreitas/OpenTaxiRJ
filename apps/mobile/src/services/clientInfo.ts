import * as Application from 'expo-application';
import { Platform } from 'react-native';

const FALLBACK_APP_VERSION = '4.1.20';

type AndroidConstants = {
  Release?: string;
  Version?: number;
  Brand?: string;
  Model?: string;
};

function androidConstants(): AndroidConstants {
  return Platform.constants as AndroidConstants;
}

export function getClientVersion() {
  return Application.nativeApplicationVersion ?? FALLBACK_APP_VERSION;
}

function getDeviceId() {
  try {
    return Application.getAndroidId() ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function getRelease() {
  if (Platform.OS === 'android') return androidConstants().Release ?? '';
  return Platform.Version;
}

function getVersionNumber() {
  if (Platform.OS === 'android') {
    return String(androidConstants().Version ?? Platform.Version);
  }
  return Platform.Version;
}

function getBrand() {
  if (Platform.OS === 'android') return androidConstants().Brand ?? '';
  return '';
}

function getModel() {
  if (Platform.OS === 'android') return androidConstants().Model ?? '';
  return '';
}

export function getPassengerInfo() {
  return {
    deviceId: getDeviceId(),
    appVersion: getClientVersion(),
    osName: Platform.OS === 'android' ? 'Android' : 'iOS',
    osVersion: String(getRelease()),
    phoneManufacturer: getBrand(),
    phoneModel: getModel(),
    timestamp: Date.now(),
  };
}

export function getSignInClientInfo() {
  return {
    appVersion: getClientVersion(),
    phoneModel: getModel(),
    phoneManufacturer: getBrand(),
    osVersion: `${getRelease()}(${getVersionNumber()})`,
    osName: Platform.OS === 'android' ? 'android' : 'ios',
  };
}

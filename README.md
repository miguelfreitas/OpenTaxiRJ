# Open Taxi RJ

Open source passenger app for Taxi.Rio, built with Expo and React Native.

## Requirements

- Node.js 20 or newer
- pnpm 9 or newer
- JDK 17 or newer, with `JAVA_HOME` set
- Android SDK, with `ANDROID_HOME` set
- An Android emulator or a device with USB debugging enabled

## Install

```sh
cd apps/mobile
pnpm install --frozen-lockfile
```

## Generate the Android project

The native Android project is generated from `app.json` and is not committed.

```sh
pnpm android:prebuild
```

## Build and run

Start the Metro server and install a debug build on the connected device or emulator:

```sh
pnpm android
```

## Build a release APK

The default build uses the local fake API and local Firebase emulator.

```sh
pnpm android:release
```

To build against the production API:

```sh
EXPO_PUBLIC_API_BASE_URL=https://api-passenger.app.taxi.rio \
EXPO_PUBLIC_WS_URL=wss://wss-passenger.app.taxi.rio \
EXPO_PUBLIC_RTDB_URL=https://taxi-rio.firebaseio.com \
EXPO_PUBLIC_FIREBASE_EMULATOR=0 \
pnpm android:release
```

The APK is written to:

```text
apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

When switching between local and production API values, force a fresh JS bundle:

```sh
rm -rf android/app/build/generated/assets/react/release \
  android/app/build/intermediates/sourcemaps/react/release
```

The default release configuration uses the generated debug signing key. Replace it with a
private release keystore before distributing the APK.

## Type check

```sh
pnpm typecheck
```

## Protocol identity

The app reports its real version (`4.1.20`) and sends the same client metadata on each
REST request: Android ID as `deviceId`, OS name/version, and device model/manufacturer.
The shared protocol IDs for city, payment, and fare discounts are carried in the normal
request payloads.

## Runtime configuration

The build reads `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_WS_URL`,
`EXPO_PUBLIC_RTDB_URL`, and `EXPO_PUBLIC_FIREBASE_EMULATOR` from `src/config.ts`.
Without them it uses the local fake API and local RTDB emulator. Sign-in stores the
bearer token under `authToken` with AsyncStorage.

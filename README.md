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

```sh
pnpm android:release
```

The APK is written to:

```text
apps/mobile/android/app/build/outputs/apk/release/app-release.apk
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

The current build points at the local fake API. The API base URL is in
`src/api/client.ts`; sign-in stores the bearer token under `authToken` with
AsyncStorage. The Firebase Realtime Database emulator configuration is in
`src/services/chat.ts`. Update both before targeting another environment.

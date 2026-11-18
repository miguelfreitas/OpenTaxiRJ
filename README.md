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

## Runtime configuration

The current build points at the local fake API. The API base URL and token are in
`src/api/client.ts`; the Firebase Realtime Database emulator configuration is in
`src/services/chat.ts`. Update both before targeting another environment.

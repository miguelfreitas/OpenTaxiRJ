# Open Taxi RJ

[Versão em português](README.md)

**Open Taxi RJ** is an independent, open-source reimplementation of the **Passengers**
client for the **Taxi.Rio** app maintained by the City of Rio de Janeiro. It is built
with Expo, React Native, and Android.

> This is an independent project. It is not affiliated with, maintained by, or endorsed
> by the City of Rio de Janeiro, Taxi.Rio, or the official app maintainers.

## Screenshots

<p align="center">
  <img src="screenshots/origem.png" width="30%" alt="Origin selection" />
  <img src="screenshots/destino.png" width="30%" alt="Destination selection" />
  <img src="screenshots/tarifa.png" width="30%" alt="Fare selection" />
</p>

<p align="center">
  Origin, destination, and fare selection.
</p>

## Why create a new app?

I was annoyed that the Taxi.Rio app does not allow moving the map pin to the exact
starting location, a basic usability feature that has been available for years in other
apps such as Uber. In the city's original app, users have to keep trying addresses until
they find the right place.

In addition, the user community can use the open app to create new features that make
life easier for passengers and drivers. For example, if the city added a PIX key field to
driver registration, the app could generate a PIX copy-and-paste code at the end of the
ride to speed up payment, with no need to type the amount, the PIX code, or anything
else.

I repeat what I always tell drivers: there is no justification for a transport service
provided by a Brazilian to another Brazilian to be intermediated (and have to pay a fee!)
by a company in California. It makes no sense.

## Features

- Sign-in with a code sent by **email**, **SMS**, or **WhatsApp**.
- Passenger registration and email-based account recovery.
- Origin and destination selection from the map or by address search.
- Recent-address history when the origin or destination field is focused.
- Route preview with estimated distance and duration.
- Fare and discount lookup, including selection of the desired option.
- Ride requests with real-time status updates.
- Ride map, route, ETA, distance, and driver information.
- Driver phone contact and ride cancellation.
- Real-time driver chat, including quick messages.
- Final fare summary and ride rating with stars and a comment.
- Account data management.
- Compatibility with the local fake server and the production API.

Payment is implemented in cash mode. Other payment methods are not part of this version.

## Development requirements

- Node.js 20 or newer
- pnpm 9 or newer
- JDK 17 or newer, with `JAVA_HOME` configured
- Android SDK configured through `ANDROID_HOME`
- Android platform tools, including `adb`
- Android emulator or a device with USB debugging enabled

This repository contains only the Expo project. The native `android/` directory is
generated and ignored by Git.

## Install dependencies

```sh
cd apps/mobile
pnpm install --frozen-lockfile
```

## Generate the Android project

```sh
cd apps/mobile
pnpm android:prebuild
```

This recreates `apps/mobile/android` from `app.json` and the local plugins, including the
native logging module.

## Development

Start Metro:

```sh
cd apps/mobile
pnpm start
```

Build and install the development app on the connected emulator or device:

```sh
cd apps/mobile
pnpm android
```

Type-check the project:

```sh
cd apps/mobile
pnpm typecheck
```

## APK builds

`EXPO_PUBLIC_*` values are embedded into the JavaScript bundle during the build. When
switching between local and production environments, remove the previous bundle before
building:

```sh
cd apps/mobile
rm -rf android/app/build/generated/assets/react/release \
  android/app/build/intermediates/sourcemaps/react/release
```

### Production build

```sh
cd apps/mobile

rm -rf android/app/build/generated/assets/react/release \
  android/app/build/intermediates/sourcemaps/react/release

EXPO_PUBLIC_API_BASE_URL=https://api-passenger.app.taxi.rio \
EXPO_PUBLIC_WS_URL=wss://wss-passenger.app.taxi.rio \
EXPO_PUBLIC_RTDB_URL=https://taxi-rio.firebaseio.com \
EXPO_PUBLIC_FIREBASE_EMULATOR=0 \
pnpm android:release
```

Copy the production APK with:

```sh
cp android/app/build/outputs/apk/release/app-release.apk \
  dist/open-taxi-rj-real.apk
```

> The current release build uses the project's generated debug key. It is suitable for
> testing and local installation, but it must not be distributed as an official build.
> For real distribution, configure a release keystore and signing in
> `apps/mobile/android/app/build.gradle`.

### Development build

The local build uses these endpoints by default:

- REST/WebSocket API at `10.0.2.2:8081` on the Android emulator
- Firebase RTDB at `10.0.2.2:9000`, namespace `taxi-rio`

The local fake server is in [`fake-server/`](fake-server/README.md), with instructions
for installing dependencies, starting the API and RTDB, selecting ride scenarios, and
running the contract tests.

```sh
cd apps/mobile

rm -rf android/app/build/generated/assets/react/release \
  android/app/build/intermediates/sourcemaps/react/release

pnpm android:release
```

The APK is written to:

```text
apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

You can copy it to a simpler path:

```sh
cp android/app/build/outputs/apk/release/app-release.apk \
  dist/open-taxi-rj-local.apk
```

## Diagnostic logs

Diagnostic logging is **disabled by default** and can be enabled at build time:

```sh
cd apps/mobile

rm -rf android/app/build/generated/assets/react/release \
  android/app/build/intermediates/sourcemaps/react/release

EXPO_PUBLIC_RIDE_LOG=1 pnpm android:release
```

Production build with logging enabled:

```sh
cd apps/mobile

rm -rf android/app/build/generated/assets/react/release \
  android/app/build/intermediates/sourcemaps/react/release

EXPO_PUBLIC_API_BASE_URL=https://api-passenger.app.taxi.rio \
EXPO_PUBLIC_WS_URL=wss://wss-passenger.app.taxi.rio \
EXPO_PUBLIC_RTDB_URL=https://taxi-rio.firebaseio.com \
EXPO_PUBLIC_FIREBASE_EMULATOR=0 \
EXPO_PUBLIC_RIDE_LOG=1 \
pnpm android:release
```

The variable is read at build time. Changing it requires rebuilding the APK and clearing
the previous bundle. To disable logging again, omit the variable or set
`EXPO_PUBLIC_RIDE_LOG=0`. With logging disabled, the app does not create the log file.

When enabled, the app writes JSON lines to:

```text
/storage/emulated/0/Android/data/org.opentaxirj.client/files/logs/ride-session.log
```

The file rotates at 32 MB. To copy the log from an emulator or device:

```sh
adb pull /sdcard/Android/data/org.opentaxirj.client/files/logs/ride-session.log
```

Logs may contain diagnostic data, addresses, and message content. Treat them as
sensitive and review them before sharing publicly.

## APK installation

With the device or emulator connected:

```sh
adb devices
adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

To install manually, copy the APK to the device, allow unknown-app installation for the
file manager, and open the file.

If installation fails because of a signature conflict with a previous version, remove
the installed version first:

```sh
adb uninstall org.opentaxirj.client
```

> Uninstalling removes the app's local data. Be careful if a session or ride is active.

## Environment configuration

| Variable | Local build default | Description |
| --- | --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | `http://10.0.2.2:8081` on Android | REST API base URL |
| `EXPO_PUBLIC_WS_URL` | Derived from the API | WebSocket URL |
| `EXPO_PUBLIC_RTDB_URL` | `http://10.0.2.2:9000?ns=taxi-rio` | Firebase RTDB URL |
| `EXPO_PUBLIC_FIREBASE_EMULATOR` | `1` when RTDB is local | Use the Firebase Emulator |
| `EXPO_PUBLIC_DRIVER_PHOTO_BASE_URL` | Derived from the API | Driver photo base URL |
| `EXPO_PUBLIC_RIDE_LOG` | `0` | Enables diagnostic logs with `1` |

## Client identity

The app identifies itself as version `4.1.20` and sends client metadata with REST
requests, including the Android identifier, operating system, and device model. City,
payment, and discount identifiers are part of the normal API payloads.

The detailed protocol specification is in [`docs/PROTOCOL.md`](docs/PROTOCOL.md).

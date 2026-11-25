# Fake Taxi.Rio server

Local REST and WebSocket server for developing and testing the Open Taxi RJ app without
using the production Taxi.Rio API. It also includes a small Firebase RTDB bridge for chat
and an automated contract test suite.

The server binds to `127.0.0.1`. The Android emulator reaches it through the host
loopback alias `10.0.2.2`, which is already the app's default local configuration.

## What it provides

- Contract-shaped endpoints for authentication, profile, routes, fares, ride creation,
  cancellation, chat, rating, and history.
- WebSocket ride-state events (`100`, `102`, `111`, `112`, `113`, `213`, and payment
  refusal `90`).
- Selectable ride scenarios for normal, error, and terminal states.
- Optional Firebase RTDB chat bridge.
- 17 contract tests that run without the app, Firebase, or external routing.
- Request logging under `logs/requests.jsonl`.

The server does not call the real Taxi.Rio API.

## Requirements

- Python 3.10 or newer
- Node.js 20 or newer, for the Firebase emulator
- npm
- Java, required by the Firebase database emulator

## Setup

From the repository root:

```sh
cd fake-server

python3 -m venv .venv
. .venv/bin/activate
python3 -m pip install -r requirements.txt
```

Install the Firebase emulator dependencies once:

```sh
cd firebase-emulator
npm install
```

## Run the local stack

Use three terminals.

### 1. Firebase RTDB

```sh
cd fake-server/firebase-emulator
npx firebase emulators:start --only database --project taxi-rio
```

The RTDB emulator listens on `127.0.0.1:9000`, namespace `taxi-rio`. Its local rules
allow reads and writes for development.

### 2. Fake API and WebSocket server

```sh
cd fake-server
. .venv/bin/activate

FAKE_REQUIRE_AUTH=1 \
FAKE_CHAT_BRIDGE=1 \
RIDE_SCENARIO=accept \
python3 server.py
```

The server listens on `127.0.0.1:8081`.

The default bearer token is `fake-token`. Authentication codes are accepted as-is by the
fake auth endpoints. The `/races/getRouteDetails` endpoint uses the public OSRM routing
service by default; set `FAKE_DISABLE_ROUTER=1` to use the built-in fallback route and
avoid external network access.

### 3. Build and run the app

```sh
cd apps/mobile
pnpm install --frozen-lockfile
pnpm android:prebuild
pnpm android:release
```

The default release build points the app to:

- `http://10.0.2.2:8081`
- `ws://10.0.2.2:8081`
- `http://10.0.2.2:9000?ns=taxi-rio`

Install the APK on the running emulator:

```sh
cd ../..
adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

For a debug build instead:

```sh
cd apps/mobile
pnpm android
```

Optional diagnostic logging is enabled at build time:

```sh
EXPO_PUBLIC_RIDE_LOG=1 pnpm android:release
```

## Ride scenarios

Select the initial scenario with `RIDE_SCENARIO`, or change it at runtime through
`POST /_control/scenario`. The scenario is evaluated when a ride is created.

| Scenario | Behavior |
| --- | --- |
| `accept` | Sends `100`, then `111` when the driver accepts. Stops at the accepted state. |
| `no_driver` | Sends only `100`; no driver is found. |
| `in_race` | Sends `100`, `111`, `112`, driver position `102`, and route update `213`. |
| `finished` | Runs the `in_race` sequence and then sends terminal state `113`. |
| `complete_run` | Moves the driver across the route, sends multiple `102` events, a `213` update, and finishes with `113`. |
| `ws_payment_refused` | Sends `100`, then WebSocket status `90` with a payment refusal reason. |
| `create_payment_refused` | `POST /races/create` immediately returns HTTP `402`. |

Runtime control:

```sh
# Inspect the current state
curl -s http://127.0.0.1:8081/_control/state

# Select a scenario
curl -s -X POST http://127.0.0.1:8081/_control/scenario \
  -H 'Content-Type: application/json' \
  -d '{"name":"finished"}'

# Reset the state; this also restores the initial RIDE_SCENARIO
curl -s -X POST http://127.0.0.1:8081/_control/reset
```

Other useful control endpoints:

- `POST /_control/race` with `{"statusId": 114}` or `{"clear": true}`
- `POST /_control/ws` with `{"statusId": 90, "payload": {"refuseReason": "test"}}`
- `POST /_control/drop_ws`
- `POST /_control/cancel_mode` with `normal`, `no_103`, `no_cancelable`, `server_error`, or `timeout`
- `POST /_control/payment` with a `pindex`
- `GET /_control/state`

The control endpoints are unauthenticated and intended only for local development. Do
not expose this server to an untrusted network.

## Validations

Run the complete contract suite from `fake-server`:

```sh
. .venv/bin/activate
python3 -m unittest -v test_contract.py
```

The tests start an isolated server on a free port and cover:

- strict routing, HTTP methods, and authentication;
- auth and profile updates;
- discounts, route details, and created-ride payloads;
- `100`, `111`, `112`, `102`, `213`, and `113` sequences;
- terminal state and cancellation behavior;
- driver payload, rating, and payment refusal;
- scenario selection and WebSocket control injection.

Expected result: `Ran 17 tests` and `OK`. The suite takes about 75 seconds.

A quick manual smoke test after starting the stack:

```sh
curl -s http://127.0.0.1:8081/_control/state
```

Then in the emulator:

1. Sign in with any accepted email/phone and code.
2. Set `finished` as the scenario.
3. Select an origin and destination and request a ride.
4. Confirm the driver card, route updates, final fare, and rating screen.
5. Reset the server with `POST /_control/reset` before the next scenario.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `FAKE_PORT` | `8081` | REST/WebSocket port |
| `RIDE_SCENARIO` | `accept` | Initial ride scenario |
| `FAKE_REQUIRE_AUTH` | `1` | Require the bearer token on non-public routes |
| `FAKE_TOKEN` | `fake-token` | Accepted bearer token |
| `FAKE_RTDB_URL` | `http://127.0.0.1:9000` | RTDB emulator URL |
| `FAKE_RTDB_NS` | `taxi-rio` | RTDB namespace |
| `FAKE_CHAT_BRIDGE` | `1` | Enable the RTDB chat bridge |
| `FAKE_ROUTER_URL` | public OSRM URL | Route provider |
| `FAKE_DISABLE_ROUTER` | `0` | Use the built-in route fallback |
| `FAKE_AUTH_STATUS` | `201` | Initial auth response status |
| `FAKE_SIGNUP_STATUS` | `200` | Initial signup response status |

## Troubleshooting

- **Emulator cannot reach the API:** confirm the server is running on
  `127.0.0.1:8081` and that the app uses `10.0.2.2:8081`, not `localhost`.
- **Chat does not update:** start the Firebase emulator and keep
  `FAKE_CHAT_BRIDGE=1`.
- **Routes are slow or fail:** use `FAKE_DISABLE_ROUTER=1` for offline development.
- **Tests cannot connect:** make sure no test process is left running. Each test uses a
  free port, but a failed run may leave a child process behind.
- **Port already in use:** stop the previous server or change `FAKE_PORT`.

Request logs are written to `logs/requests.jsonl`; the `logs/` directory is ignored by
Git.

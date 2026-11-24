# Taxi.Rio Passenger Protocol Specification

## 1. Scope and confidence

Covered:

- Version gate, passenger authentication, session restore, and logout.
- Passenger profile, origin city, address history, and route/fare selection.
- Ride creation, cancellation, realtime ride states, active-ride recovery, chat, and
  rating.
- Driver payload fields, payment methods, and privacy boundaries.
- The local fake stack used for replay and contract tests.

Excluded or not established:

- On-street pairing, corporate billing, card registration, FCM/GMS push, and native
  Google Maps behavior.
- Exact server-side validation, refresh-token behavior, and Firebase security rules.


## 2. Hosts and transport

| Item | Value |
|---|---|
| REST base | `https://api-passenger.app.taxi.rio` |
| WebSocket | `wss://wss-passenger.app.taxi.rio` |
| Firebase project | `taxi-rio` |
| RTDB URL | `https://taxi-rio.firebaseio.com` |
| RTDB chat prefix | `/race-chat/release/{raceId}/...` |
| Driver photos | `https://files.apps.taxi.rio/google/storage/url/drivers` |
| Fare information | `https://race.web.app.taxi.rio/fareinformation/?cityId=` |
| Blocked check | `https://api.apps.taxi.rio/v1/passengers/blocked` |
| Geocoding | Google Geocoding API |

Every REST request carries:

```http
Authorization: Bearer <authToken>        # when a token is stored
PassengerInfo: <json>                    # every request, including unauthenticated
Content-Type: application/json           # when a body exists
Accept: application/json, text/plain, */*
```

Original transport facts:

- Axios/OkHttp; `Connection: close`; `User-Agent: okhttp/4.12.0`.
- General API timeout: 30,000 ms.
- Auth calls use a 5,000 ms `AbortController` timeout.
- 401 triggers logout.
- No certificate pinning was found in application code.

Open Taxi RJ uses `fetch` with a 10,000 ms request timeout and adds the same
`PassengerInfo` and bearer headers. It does not reproduce OkHttp transport fingerprints.

## 3. Client identity

`PassengerInfo`:

```json
{
  "deviceId": "<Android ID>",
  "appVersion": "4.1.20",
  "osName": "Android",
  "osVersion": "9",
  "phoneManufacturer": "google",
  "phoneModel": "AOSP on IA Emulator",
  "timestamp": 0
}
```

Sign-in and registration add:

```json
{
  "appVersion": "4.1.20",
  "phoneModel": "<model>",
  "phoneManufacturer": "<brand>",
  "osVersion": "9(28)",
  "osName": "android"
}
```

`deviceId` is `Settings.Secure.ANDROID_ID`. It is scoped to signing key, user, and
device; a clone signed with a different key will not share the original value.

## 4. Endpoint inventory

Authentication classes: **public** (no bearer expected), **auth** (bearer expected),
**quote** (authenticated POST that calculates rather than creates), **write** (creates or
changes server state).

| Method | Path | Class | Notes |
|---|---|---|---|
| GET | `/auth/checkMinimumAppVersion?currentVersion=` | public | `{ needsUpdate, message? }` |
| POST | `/auth/authPassenger` | public | `{ login, phoneNumber, useWhatsApp }`; 200/201/202 |
| POST | `/auth/signIn` | public | SMS or email code; returns `{ token }` |
| POST | `/auth/verifySmsCode` | public | `{ login, phoneNumber, smsCode }` |
| POST | `/auth/verifyEmailCode` | public | `{ login, phoneNumber, emailCode }` |
| POST | `/auth/sendNewSmsCode` | public | `{ phoneNumber }` |
| POST | `/auth/sendNewWhatsAppCode` | public | `{ phoneNumber }` |
| POST | `/auth/sendEmailCode` | public | `{ login }` |
| POST | `/auth/loginRecovery` | public | SMS/email recovery then token |
| POST | `/auth/signUp` | public | Registration; returns `{ token }` |
| POST | `/accountrecovery/sendvalidationcode` | public | `{ login }`; phone-change recovery |
| POST | `/accountrecovery/verifyvalidationcode` | public | `{ login, validationCode, phoneNumber, oldPhoneNumber? }` |
| GET | `/aboutme/aboutMePassenger` | auth | Profile plus `currentRace` and `statusId` |
| POST | `/aboutme/getMyOriginCity` | auth | `{ lat, lng }`; returns city and payment eligibility |
| POST | `/account/updatePassengerAndUserData` | write | Profile update |
| POST | `/account/updatePhoneNumber` | write | Phone-change flow |
| POST | `/aboutme/savePushToken` | write | FCM; excluded from the clone |
| POST | `/aboutme/setMyPaymentMethod` | write | `{ pindex, paymentId }` |
| GET | `/aboutme/getUpdatedCreditCards` | auth | Sensitive payment metadata |
| POST | `/aboutme/removeCreditCard` | write | `{ cardId }` |
| GET | `/races/getAutocompleteRadius` | public | `{ radius }` |
| GET | `/races/getRouteDetails?origin=&destination=` | public | Flat route response |
| POST | `/races/fares` | quote | Array of discount/fare rows |
| POST | `/races/onStreetFares` | quote | Excluded on-street flow |
| POST | `/races/create` | write | Creates a ride; accepts 200/202/402 |
| POST | `/races/createOnStreet` | write | Excluded on-street flow |
| POST | `/races/cancel` | write | No body |
| POST | `/races/rating` | write | `{ ratingSelected, comment }` |
| POST | `/races/notRating` | write | No body; completes without rating |
| POST | `/races/updateRating` | write | Excluded by decision |
| POST | `/races/updateComment` | write | Excluded by decision |
| POST | `/races/sendMessageToDriver` | write | `{ raceId, message }` |
| GET | `/races/raceHistory?currentPage=&paymentInApp=` | auth | Page defaults to 1 |
| GET | `/races/raceHistoryById?raceId=` | auth | Single history item |
| POST | `/races/addPassengerUserName` | write | `{ fullName }` |
| POST | `/races/addCpf` | write | CPF object |
| POST | `/races/sendContactUs` | write | Contact object |

## 5. Authentication

### 5.1 Version gate

`GET /auth/checkMinimumAppVersion?currentVersion=<version>` returns:

```json
{ "needsUpdate": false }
```

The client continues when `needsUpdate` is false or absent. Exact update-screen behavior
is not part of the clone.

### 5.2 Passenger lookup and status branches

`POST /auth/authPassenger`:

```json
{
  "login": "passenger@example.com",
  "phoneNumber": "21999999999",
  "useWhatsApp": true
}
```

Observed status handling:

| Status | Meaning | Client action |
|---|---|---|
| 200 | Known passenger, verification required | Verification screen, then `/auth/signIn` with `smsCode` |
| 201 | New passenger/registration path | Verification screen, then `/auth/verifySmsCode`, then Register, then `/auth/signUp` |
| 202 | Phone differs from the registration | Email recovery screen with `oldPhoneNumber` |

Responses for 202 may include `{ "oldPhoneNumber": "..." }`.

4.1.22 has a separate email-login path. It calls `/auth/sendEmailCode` with `{ login }`,
then submits `/auth/signIn` with `emailCode` instead of `smsCode`. The clone exposes
E-mail, SMS, and WhatsApp code delivery; the email path uses the same send/verify/sign-in
sequence with `emailCode`.

### 5.3 Sign-in

`POST /auth/signIn`:

```json
{
  "login": "passenger@example.com",
  "phoneNumber": "21999999999",
  "smsCode": "123456",
  "cityId": "",
  "appVersion": "4.1.20",
  "phoneModel": "AOSP on IA Emulator",
  "phoneManufacturer": "google",
  "osVersion": "9(28)",
  "osName": "android"
}
```

`emailCode` replaces `smsCode` for email login. Success returns:

```json
{ "token": "<authToken>" }
```

The token is stored in AsyncStorage under `authToken`, without SecureStore or encrypted
storage. A 401 clears the token, profile, payment state, and address history.

### 5.4 Registration and resend

`POST /auth/signUp`:

```json
{
  "login": "passenger@example.com",
  "phoneNumber": "21999999999",
  "smsCode": "123456",
  "emailCode": null,
  "fullName": "Passageiro Exemplo",
  "displayName": "Passageiro",
  "appVersion": "4.1.20",
  "phoneModel": "AOSP on IA Emulator",
  "phoneManufacturer": "google",
  "osVersion": "9(28)",
  "osName": "android"
}
```

Success returns `{ token }`. Observed fake error statuses: 400 invalid data, 409 account
exists, 500 internal error.

Resend endpoints:

- `POST /auth/sendNewSmsCode` `{ phoneNumber }`
- `POST /auth/sendNewWhatsAppCode` `{ phoneNumber }`
- `POST /auth/sendEmailCode` `{ login }`

`POST /auth/verifySmsCode` and `/auth/verifyEmailCode` validate a code and return 200
without a token; the token comes from `/auth/signIn`.

### 5.5 Account recovery

Phone-change recovery:

- `POST /accountrecovery/sendvalidationcode` `{ login }`
- `POST /accountrecovery/verifyvalidationcode`
  `{ login, validationCode, phoneNumber, oldPhoneNumber? }`

On success the client continues to sign-in with the new phone number.

## 6. Profile and origin city

`GET /aboutme/aboutMePassenger` returns either the profile directly or under `payload`:

```json
{
  "payload": {
    "passengerId": "fake-passenger-1",
    "statusId": 99,
    "typeOfCall": null,
    "currentRace": null,
    "associatedPaymentMethod": {
      "pindex": 1,
      "paymentId": "money",
      "name": "Dinheiro"
    },
    "listEligiblePaymentMethodsNative": [],
    "isAbleToUsePaymentInApp": true,
    "user": {
      "fullName": "Passageiro Fake",
      "displayName": "Fake",
      "email": "fake@example.com",
      "phoneNumber": "21999999999",
      "cpf": "00000000000"
    },
    "city": { "cityId": "1", "name": "Rio de Janeiro" }
  }
}
```

`currentRace` is the startup recovery source. While a ride is active it must be non-null
and include `raceId`, `statusId`, origin/destination, and the driver when accepted.

`POST /aboutme/getMyOriginCity` `{ lat, lng }` returns:

```json
{
  "cityId": "1",
  "name": "Rio de Janeiro",
  "isAbleToUsePaymentInApp": true
}
```

The city ID is a **string** in fare and create requests. A numeric city ID produced an
empty fare list in the production run.

`POST /account/updatePassengerAndUserData` accepts `fullName`, `displayName`, `email`,
and `phoneNumber`. The fake server persists those fields.

## 7. Routing, fares, and ride creation

### 7.1 Route details

`GET /races/getRouteDetails?origin=<lat>,<lng>&destination=<lat>,<lng>`

Response is flat:

```json
{
  "polyline": "<encoded Google polyline>",
  "distance": 1.906,
  "duration": 188,
  "source": "osrm"
}
```

- `distance` is kilometres.
- `duration` is seconds.
- The polyline is decoded for the map and sent back unchanged in create.
- A nested `{ distance: { value, text } }` shape is not accepted by the original.

The fake server uses OSRM by default and can fall back to an encoded straight line with
`FAKE_DISABLE_ROUTER=1`.

### 7.2 Fares

`POST /races/fares`:

```json
{
  "origin": {
    "formattedAddress": "Av. Alm. Barroso, 472 - Centro",
    "position": { "lat": -22.9068, "lng": -43.1728983 }
  },
  "destination": {
    "formattedAddress": "R. Pedro I, 19 - Centro",
    "position": { "lat": -22.9078736, "lng": -43.1823585 }
  },
  "associatedPaymentMethod": { "pindex": 1, "paymentId": null },
  "cityId": "1"
}
```

The response is an **array**, not an object:

```json
[
  {
    "fare": "Tarifa Normal",
    "flag": "Bandeira 1",
    "discountId": "59c424f09c4b6aa933bbed93",
    "amountOfDrivers": 3,
    "estimatedPrice": "20.00"
  }
]
```

The original `fare` value must be one of:

| Fare | Discount ID |
|---|---|
| `Tarifa Normal` | `59c424f09c4b6aa933bbed93` |
| `10%` | `59c424f09c4b6aa933bbed94` |
| `20%` | `59c424f09c4b6aa933bbed95` |
| `30%` | `59c424f09c4b6aa933bbed96` |
| `40%` | `59c424f09c4b6aa933bbed97` |

An unknown `fare` string crashes the original discount lookup. The clone exposes all
returned rows, not only the first.

### 7.3 Payment methods

Payment groups:

| Group | `pindex` | Meaning |
|---|---|---|
| In-app | 5 | In-app card |
| In-app | 4 | Corporate |
| To driver | 1 | Dinheiro |
| To driver | 2 | Crédito no Táxi |
| To driver | 3 | Débito no Táxi |
| To driver | 10 | PIX |

Payment semantics:

- `pindex 10` is PIX as **payment to the driver**, under the label
  `Pagamento no táxi`.
- The client sends only the method/payment identifier. There is no PIX key, QR code,
  copy-and-paste payload, in-app charge, or payment confirmation endpoint.
- Cash and PIX settle directly between passenger and driver.
- The clone is money-only by decision and sends `pindex 1`; it has no payment selector.
- Fare requests require the eligible method’s `paymentMethodId`; create requests send
  the same selected method.

### 7.4 Create

`POST /races/create`:

```json
{
  "geoLocationData": {
    "origin": {
      "formattedAddress": "Av. Alm. Barroso, 472 - Centro",
      "position": { "lat": -22.9068, "lng": -43.1728983 }
    },
    "destination": {
      "formattedAddress": "R. Pedro I, 19 - Centro",
      "position": { "lat": -22.9078736, "lng": -43.1823585 }
    }
  },
  "associatedPaymentMethod": { "pindex": 1, "paymentId": null },
  "raceDiscount": {
    "id": "59c424f09c4b6aa933bbed93",
    "fare": "Tarifa Normal"
  },
  "corporateRaceJustification": null,
  "city": { "cityId": "1", "cityName": "Rio de Janeiro" },
  "routeOriginDestination": {
    "polyline": "<encoded polyline>",
    "distance": { "text": "1.9 km", "value": 1906 },
    "duration": { "text": "3 minutos", "value": 188 }
  }
}
```

A 202 response creates the ride and returns `{ raceId, timeOut, message }`; the fake
returns the full race object. The real response observed in the 2026-11-24 ride was
`202` with `{ "message": "Procurando taxistas...", "raceId": "...", "timeOut": "60" }`.
The client moves to FindingDriver and waits for WebSocket events. 402 is a payment
refusal in the fake contract; 200 is accepted by the client for older fake responses.

## 8. Realtime ride protocol

### 8.1 Connection and envelope

```js
new WebSocket("wss://wss-passenger.app.taxi.rio", [], {
  headers: { Authorization: "Bearer " + authToken }
})
```

Server messages use:

```json
{ "statusId": 111, "payload": { } }
```

The client sends a location update:

```json
{ "statusId": 199, "payload": { "lat": -22.9068, "lng": -43.1729, "cityId": "1" } }
```

### 8.2 Status table

| Status | Effect |
|---|---|
| 80 | No-op/keepalive-like branch |
| 90 | Payment refused; `payload.refuseReason`, error `ws_refused_credit_card` |
| 100 | Current-race/status update, restore, or progress update |
| 101 | `setBaratinhas(payload)` (excluded) |
| 102 | Driver position; `payload.position.lat/lng` and optional `isFromReactNative`; may request recalculation |
| 103 | Cancellation; reset to WithoutRace, reset countdown |
| 104 | Reset on-street pairing |
| 105 | Refresh passenger/status |
| 110 | FindingDriver (clone compatibility) |
| 111 | Driver accepted; WaitingDriver |
| 112 | InRace |
| 113 | Race finished; RaceFinished/rating |
| 114 | Finished status in `currentRace`; clone maps to finished |
| 199 | Client-to-server location update |
| 213 | Current-phase route snapshot (can follow 111/112 or update mid-ride); polyline, distance in km, duration in minutes |

### 8.3 Status 111: acceptance

Real 111 sends a partial `driver` containing `addressAcceptedRace`; the full driver
record arrives in `aboutMePassenger.currentRace.driver` and may include `_id`,
`displayName`, `phoneNumber`, `taxiDriverId`, `carModel`, `carLicensePlate`, `average`,
`driverType`, and `geolocationData`. Merge partial driver frames with the prior driver
instead of replacing the object.

Required payload content:

```json
{
  "statusId": 111,
  "payload": {
    "driver": {
      "displayName": "Motorista",
      "carModel": "Modelo",
      "carLicensePlate": "ABC1D23",
      "phoneNumber": "21999999999",
      "taxiDriverId": "driver-id",
      "driverId": "driver-id",
      "addressAcceptedRace": {
        "formattedAddress": "Praca Floriano, Centro",
        "position": { "lat": -22.9068, "lng": -43.1729 }
      }
    },
    "routeDriverPassenger": {
      "polyline": "<encoded polyline>",
      "distance": { "value": 1200 },
      "duration": { "value": 300 }
    },
    "currentRace": { "statusId": 111 }
  }
}
```

Original behavior:

- Sets the driver position from `driver.addressAcceptedRace`, not from a top-level
  `position`.
- Sets distance and duration from `routeDriverPassenger.distance.value` and
  `.duration.value`, and sets the route polyline from `.polyline`.
- Calls `updatePassengerAndStatus`; `/aboutme/aboutMePassenger` must already expose the
  same active race or the client can overwrite the race with `currentRace: null`.
- Shows WaitingDriver and the driver card.

The clone now consumes `addressAcceptedRace`, maps the driver-route fields, and keeps the
legacy `name`/`carPlate` fallbacks.

### 8.4 Status 112: in race

The original reads `payload.routeOriginDestination` and updates distance, duration, and
polyline. It sets the passenger state to InRace and clears on-street pairing. Real 112
can carry a partial `driver` with only `driverType` and `geolocationData`; merge it into
the existing driver.

The clone now applies the same route update. A payload without a valid polyline leaves
the previous route intact.

### 8.5 Status 102: driver position

`payload.position.lat/lng` is required; real frames also include
`isFromReactNative: true`. Top-level `latitude`/`longitude` is not accepted by the
original and caused `Cannot read property 'lat' of undefined` in the harness.

The clone clears the taxi marker on a null or invalid position only when a new ride
starts or the ride stops; a valid 102 updates the marker.

### 8.6 Status 213: route snapshot

Real 111 and 112 can be followed immediately by 213 with the current phase route. A
mid-ride 213 can also replace the remaining route. Real payload observed on 2026-11-24:

```json
{
  "statusId": 213,
  "payload": {
    "polyline": "<encoded polyline>",
    "distance": 2.82,
    "duration": 9.433333333333334
  }
}
```

- `distance` is in kilometres; multiply by 1000 for metres. A preceding
  `routeOriginDestination.distance.value` of `2820` matched `213.distance: 2.82`.
- `duration` is in minutes; multiply by 60 for seconds. `9.4333` minutes matched
  `566` seconds.
- The fake server now emits the real units and the client applies both multipliers.

### 8.7 Status 113: finished fare

Real 113 carries the final fare directly in `payload` (not only inside `currentRace`):

```json
{
  "statusId": 113,
  "payload": {
    "raceId": "...",
    "total": "30,36",
    "discount": "6,07",
    "discountValue": "24,29",
    "priceToPay": "24,29",
    "raceDiscount": { "fare": "20%", "flag": "Bandeira 1" },
    "associatedPaymentMethod": { "pindex": 1, "name": "Dinheiro" },
    "tolls": [],
    "invalid": false,
    "suspect": false,
    "driver": {
      "displayName": "Motorista",
      "carModel": "KICKS",
      "carLicensePlate": "ABC1D23"
    }
  }
}
```

- Money strings use comma decimals; `total - discount = priceToPay` in the observed
  frame.
- `driver` is partial; merge it into the existing driver so phone/photo/ID survive.
- The clone surfaces total, discount, tolls, amount to pay, and payment method on the
  rating screen.

### 8.8 Cancellation and recovery

Cancellation:

- `POST /races/cancel` with no body.
- The server returns 200 and broadcasts status 103.
- The original and clone return home and clear the active ride.
- If the server rejects cancellation with “Nenhuma corrida que possa ser cancelada
  foi encontrada para esse passageiro”, the local ride is already gone. The clone
  clears it and returns home instead of trapping the user on a stale ride.

Startup recovery:

- `GET /aboutme/aboutMePassenger` returns non-null `currentRace` and `statusId`.
- The clone hydrates the booking and opens the ride screen at 100/110/111/112.
- A recovered 103 returns home.
- The original may also restore from `statusId` and route fields in `currentRace`.

### 8.9 Reconnect and stale-ride reconciliation

The WebSocket can drop after status 111 while the server later closes the ride. If
the terminal 103 is missed, the client must not trust the last rendered state.

The clone now:

- Reconnects with exponential backoff while a ride is active.
- Rejects messages whose `currentRace.raceId` does not match the active race.
- Refreshes `aboutMePassenger` on every successful socket open, not only on later
  reconnect attempts, and when the app returns to the foreground.
- Runs a 30-second watchdog while finding, waiting, or in-race; if the socket stays
  half-open and no terminal frame arrives, it refreshes the profile and applies the
  server state.
- If the profile has no `currentRace`, closes the local ride (status 103) and
  returns home, including when the local stage was still FindingDriver.
- Recovers driver/status/route from `currentRace` when the profile still has the
  ride, including `100/110` messages whose `currentRace.statusId` is already
  `111/112`.
- Treats `103/113/114` from `currentRace` as terminal before the raw envelope
  status, so a stale `100` cannot keep the UI on WaitingDriver.
- Refreshes the profile after an ambiguous cancel failure; a missing or terminal
  `currentRace` returns home instead of showing a retry loop.
- Refreshes the profile after an ambiguous create failure or a create response
  without `raceId`; an active `currentRace` is adopted and the fake `fake-race-1`
  fallback is never used.
- Uses the status-111 accepted position for the driver marker and the
  `routeDriverPassenger` polyline; status 112 uses `routeOriginDestination`.
- Preserves the latest live `102` position and `213` route when a profile refresh
  returns the same status; otherwise a watchdog refresh could reset the car to the
  accepted position and the line to the initial route.
- Runs origin recovery only while Origin is focused, and starts `RideScreen` once per
  `raceId`; an earlier build re-navigated on profile status changes and reconnected the
  socket five times in one real ride.
- Runs RouteFare's route/fare reload only while focused and keyed by the payment
  identity, so a background refresh cannot replace the selected discount.
- Resets ride stage/status in `stop`, preventing a stale finished state from sending a
  new ride straight to the rating screen.

This was reproduced on the emulator: accept a fake ride, kill the WebSocket/server
while clearing the fake server’s current race, then let the client reconnect. The
fixed client returns to Origin instead of remaining on WaitingDriver.

## 9. Driver payload and privacy

Fields consumed by the original driver card/Chat/Rate screens:

| Field | Use |
|---|---|
| `displayName` | Name |
| `carModel` | Vehicle model |
| `carLicensePlate` | Plate |
| `phoneNumber` | Displayed and used for the call action |
| `taxiDriverId` / `driverId` | Identity and photo lookup |
| `addressAcceptedRace` | Accepted driver position at status 111 |
| `position` | Live marker, mainly status 102 |

The clone prefers `displayName` and `carLicensePlate`, falling back to `name` and
`carPlate` for older fixtures. It now displays `phoneNumber`, calls
`tel:0<digits>` as the original does, and shows the driver photo when available.

Driver photo lookup:

```text
GET https://files.apps.taxi.rio/google/storage/url/drivers/{cityId}/{taxiDriverId}
GET https://files.apps.taxi.rio/google/storage/url/drivers/{taxiDriverId}
```

The second form is used when `cityId` is the special value
`5e2b16adfb8eba33461db886`. The response is expected to contain `{ "url": "..." }`.
Lookup failure is non-fatal; the clone falls back to the initial.

Privacy boundary:

- The original consumes the driver phone for the call action. It does **not** consume a
  driver PIX key, CPF, email, or an address beyond `addressAcceptedRace`.
- Unknown JSON properties are not validated or stripped by the client, so a modified
  client could inspect extra server fields. No additional PII has been observed in
  captured driver payloads.
- Do not assume a field is absent merely because the stock UI does not display it.

## 10. Chat

Protocol:

- Passenger listens on `/race-chat/release/{raceId}/Passenger`.
- Passenger sends to `/race-chat/release/{raceId}/Driver`.
- REST fallback/mirror: `POST /races/sendMessageToDriver` `{ raceId, message }`.
- Message shape:

```json
{
  "messageCode": "<push key>",
  "messageText": "texto",
  "read": false,
  "time": 0
}
```

The client uses the Firebase JS SDK directly against the RTDB (clone) or the native SDK
(original). No Firebase Auth/App Check token was observed. The fake harness redirects
the native SDK through a TLS terminator into the RTDB emulator. Do not test writes against
another race or production.

## 11. Rating

`POST /races/rating`:

```json
{ "ratingSelected": 5, "comment": "Excelente" }
```

`POST /races/notRating` has no body and marks the ride as skipped. The original rating
screen was reached, but a star/comment submission was not captured in the harness. The
endpoint and clone path are covered by the fake contract, not by an original-client
submission trace. `updateRating` and `updateComment` are outside this clone's scope.

## 12. Fake stack and verification

Primary commands:

```bash
cd /home/miguel/hg/rea/taxi-rio
python3 fake-server/test_contract.py
pnpm --dir apps/mobile run typecheck
```

Fake stack:

| Component | Address |
|---|---|
| REST/WS | `127.0.0.1:8081`; emulator `10.0.2.2:8081` |
| RTDB emulator | `127.0.0.1:9000`, namespace `taxi-rio` |
| RTDB TLS bridge | `127.0.0.1:9443` via `socat` |
| mitmproxy | `10.0.2.2:8080` for the original client |
| Original REST/WS redirect | `fake-server/redirect_addon.py` |

Fake ride scenarios: `accept`, `no_driver`, `in_race`, `finished`, `complete_run`,
`ws_payment_refused`, `create_payment_refused`.

Coverage status:

| Area | Status |
|---|---|
| Version/auth status branches | Contract; original observed |
| WhatsApp/SMS resend, sign-up, recovery | Contract; original 4.1.22 WhatsApp observed |
| Profile, origin city, identity headers | Contract; original observed |
| Route/fares/create | Contract; original observed |
| 100/111/112/102/213/113/114 | Contract; original observed |
| 103 cancellation/startup recovery | Contract; original observed |
| Driver field parity | Contract; original static; clone updated |
| Chat RTDB send/receive | Contract; original observed |
| Rating submission | Contract; original not captured |
| FCM/push, on-street, corporate | Excluded |

## 13. Known divergences and residuals

Closed in the clone:

- Driver name now prefers `displayName`.
- Plate now prefers `carLicensePlate`.
- `phoneNumber` is displayed and calls the driver.
- `addressAcceptedRace` drives the status-111 marker.
- Driver photo is fetched by `taxiDriverId`/`driverId`, with city-aware URL construction.
- Status 111/112 route payloads update the live route.
- Fake driver fixture includes the original field names and phone.
- Status 213 real units are kilometres/minutes, fixed in the client and fake server.
- Clone marker movement and `213` polyline shortening are verified on the emulator.
- Original-vs-clone A/B completed with the installed original 4.1.20: visible taxi
  marker, in-race route/ETA update, and rating reached; clone produced the same
  state/visual behavior on its seeded route.

Still divergent or unverified:

- Original 4.1.22 reports `appVersion 4.1.22`; clone reports `4.1.20`.
- Original `102` requests a fresh driver-to-destination route; clone relies on `213`
  for the route update. Real 213 may be a current-phase snapshot rather than a
  mid-ride recalculation; the clone treats it as authoritative for the live route.
- Original 4.1.22 exposes a separate email-code login path; clone exposes E-mail, SMS,
  and WhatsApp code delivery.
- Original rating submission was not captured; only `notRating` was.
- FCM registration and `/aboutme/savePushToken` are intentionally excluded.
- On-street, corporate, card registration, and Google Maps native behavior are excluded.
- Exact auth token lifetime, refresh behavior, and server-side device binding remain
  unknown.

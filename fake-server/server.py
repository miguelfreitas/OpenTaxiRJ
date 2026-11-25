#!/usr/bin/env python3
import asyncio
import json
import logging
import math
import os
import time
from pathlib import Path

from aiohttp import ClientSession, ClientTimeout, web

LOG_DIR = Path(__file__).parent / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_PATH = LOG_DIR / "requests.jsonl"
PORT = int(os.environ.get("FAKE_PORT", "8081"))
DEFAULT_SCENARIO = os.environ.get("RIDE_SCENARIO", "accept")
AUTH_REQUIRED = os.environ.get("FAKE_REQUIRE_AUTH", "1") == "1"
ROUTER_URL = os.environ.get(
    "FAKE_ROUTER_URL", "https://router.project-osrm.org/route/v1/driving"
)
ROUTER_ENABLED = os.environ.get("FAKE_DISABLE_ROUTER", "0") != "1"
ROUTE_CACHE = {}
RTDB_URL = os.environ.get("FAKE_RTDB_URL", "http://127.0.0.1:9000").rstrip("/")
RTDB_NS = os.environ.get("FAKE_RTDB_NS", "taxi-rio")
CHAT_BRIDGE = os.environ.get("FAKE_CHAT_BRIDGE", "1") == "1"
DISCOUNTS = (
    ("Tarifa Normal", "Bandeira 1", "59c424f09c4b6aa933bbed93", "20.00", 3),
    ("10%", "Bandeira 1", "59c424f09c4b6aa933bbed94", "18.00", 2),
    ("20%", "Bandeira 1", "59c424f09c4b6aa933bbed95", "16.00", 2),
    ("30%", "Bandeira 1", "59c424f09c4b6aa933bbed96", "14.00", 1),
    ("40%", "Bandeira 1", "59c424f09c4b6aa933bbed97", "12.00", 1),
)

SCENARIOS = {
    "accept",
    "no_driver",
    "in_race",
    "finished",
    "complete_run",
    "ws_payment_refused",
    "create_payment_refused",
}

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("fake")

STATE = {
    "token": os.environ.get("FAKE_TOKEN", "fake-token"),
    "race": None,
    "history": [],
    "ws_clients": set(),
    "scenario": DEFAULT_SCENARIO if DEFAULT_SCENARIO in SCENARIOS else "accept",
    "generation": 0,
    "ride_task": None,
    "ratings": {},
    "chat_seen": set(),
    "auth_status": int(os.environ.get("FAKE_AUTH_STATUS", "201")),
    "signup_status": int(os.environ.get("FAKE_SIGNUP_STATUS", "200")),
    "cancel_mode": "normal",
    "create_mode": "normal",
    "payment": {"pindex": 1, "paymentId": "money", "name": "Dinheiro"},
    "user": {
        "userId": "fake-user-1",
        "fullName": "Passageiro Fake",
        "displayName": "Fake",
        "email": "fake@example.com",
        "phoneNumber": "21999999999",
        "cpf": "00000000000",
    },
}

ROUTES = {
    "/auth/checkMinimumAppVersion": {"GET"},
    "/auth/authPassenger": {"POST"},
    "/auth/signIn": {"POST"},
    "/auth/loginRecovery": {"POST"},
    "/auth/signUp": {"POST"},
    "/auth/verifySmsCode": {"POST"},
    "/auth/verifyEmailCode": {"POST"},
    "/auth/sendNewSmsCode": {"POST"},
    "/auth/sendNewWhatsAppCode": {"POST"},
    "/auth/sendEmailCode": {"POST"},
    "/accountrecovery/sendvalidationcode": {"POST"},
    "/accountrecovery/verifyvalidationcode": {"POST"},
    "/account/updatePhoneNumber": {"POST"},
    "/account/updatePassengerAndUserData": {"POST"},
    "/aboutme/aboutMePassenger": {"GET"},
    "/aboutme/getMyOriginCity": {"POST"},
    "/aboutme/getUpdatedCreditCards": {"GET"},
    "/aboutme/savePushToken": {"POST"},
    "/aboutme/setMyPaymentMethod": {"POST"},
    "/aboutme/removeCreditCard": {"POST"},
    "/races/getAutocompleteRadius": {"GET"},
    "/races/getRouteDetails": {"GET"},
    "/races/raceHistory": {"GET"},
    "/races/raceHistoryById": {"GET"},
    "/races/fares": {"POST"},
    "/races/onStreetFares": {"POST"},
    "/races/create": {"POST"},
    "/races/createOnStreet": {"POST"},
    "/races/cancel": {"POST"},
    "/races/notRating": {"POST"},
    "/races/rating": {"POST"},
    "/races/updateRating": {"POST"},
    "/races/updateComment": {"POST"},
    "/races/sendContactUs": {"POST"},
    "/races/sendMessageToDriver": {"POST"},
    "/races/addPassengerUserName": {"POST"},
    "/races/addCpf": {"POST"},
    "/_control/state": {"GET"},
    "/_control/reset": {"POST"},
    "/_control/scenario": {"POST"},
    "/_control/ws": {"POST"},
    "/_control/drop_ws": {"POST"},
    "/_control/race": {"POST"},
    "/_control/cancel_mode": {"POST"},
    "/_control/create_mode": {"POST"},
    "/_control/payment": {"POST"},
    "/_control/auth_status": {"POST"},
    "/_control/signup_status": {"POST"},
}

PUBLIC_PATHS = {
    "/auth/checkMinimumAppVersion",
    "/auth/authPassenger",
    "/auth/signIn",
    "/auth/loginRecovery",
    "/auth/signUp",
    "/auth/verifySmsCode",
    "/auth/verifyEmailCode",
    "/auth/sendNewSmsCode",
    "/auth/sendNewWhatsAppCode",
    "/auth/sendEmailCode",
    "/accountrecovery/sendvalidationcode",
    "/accountrecovery/verifyvalidationcode",
    "/races/getAutocompleteRadius",
    "/races/getRouteDetails",
}


def now_ms():
    return int(time.time() * 1000)


def log_event(kind, **fields):
    rec = {"ts": now_ms(), "kind": kind, **fields}
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    log.info("%s %s", kind, fields)


def fake_driver():
    return {
        "_id": "fake-driver-object",
        "taxiDriverId": "fake-driver-1",
        "driverId": "fake-driver-1",
        "displayName": "Motorista Fake",
        "name": "Motorista Fake",
        "carModel": "Fake Car",
        "carLicensePlate": "FAKE123",
        "carPlate": "FAKE123",
        "phoneNumber": "21999999999",
        "average": 4.9,
        "driverType": "",
        "addressAcceptedRace": {
            "formattedAddress": "Praca Floriano, Centro",
            "position": {"lat": -22.9068, "lng": -43.1729},
            "coords": {"lat": -22.9068, "lng": -43.1729},
            "latitude": -22.9068,
            "longitude": -43.1729,
        },
        "geolocationData": {
            "origin": {
                "formattedAddress": "Praca Floriano, Centro",
                "position": {"lat": -22.9068, "lng": -43.1729},
            }
        },
    }


def haversine_km(origin, destination):
    lat1, lng1 = origin
    lat2, lng2 = destination
    radius = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(a))


def encode_polyline(points):
    output = []
    previous_lat = 0
    previous_lng = 0
    for lat, lng in points:
        lat_e5 = round(lat * 1e5)
        lng_e5 = round(lng * 1e5)
        d_lat = lat_e5 - previous_lat
        d_lng = lng_e5 - previous_lng
        previous_lat = lat_e5
        previous_lng = lng_e5
        for value in (d_lat, d_lng):
            shifted = value << 1
            if value < 0:
                shifted = ~shifted
            while shifted >= 0x20:
                output.append(chr((0x20 | (shifted & 0x1F)) + 63))
                shifted >>= 5
            output.append(chr(shifted + 63))
    return "".join(output)


def decode_polyline(encoded):
    points = []
    index = 0
    lat = 0
    lng = 0
    while index < len(encoded):
        result = 0
        shift = 0
        while True:
            byte = ord(encoded[index]) - 63
            index += 1
            result |= (byte & 0x1F) << shift
            shift += 5
            if byte < 0x20:
                break
        lat += ~(result >> 1) if result & 1 else result >> 1

        result = 0
        shift = 0
        while True:
            byte = ord(encoded[index]) - 63
            index += 1
            result |= (byte & 0x1F) << shift
            shift += 5
            if byte < 0x20:
                break
        lng += ~(result >> 1) if result & 1 else result >> 1
        points.append((lat / 1e5, lng / 1e5))
    return points


def parse_lat_lng(value):
    if not value:
        raise ValueError("missing coordinate")
    parts = value.split(",")
    if len(parts) != 2:
        raise ValueError("coordinate must be lat,lng")
    lat, lng = float(parts[0]), float(parts[1])
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise ValueError("coordinate out of range")
    return lat, lng


def fallback_route_details(origin, destination):
    distance = haversine_km(origin, destination)
    duration = max(60, int(distance / 18 * 3600))
    bounds = (
        (origin[0], origin[1]),
        (destination[0], destination[1]),
    )
    return {
        "polyline": encode_polyline(bounds),
        "distance": round(distance, 3),
        "duration": duration,
        "source": "fallback",
    }


async def local_route_details(origin, destination):
    key = (round(origin[0], 6), round(origin[1], 6), round(destination[0], 6), round(destination[1], 6))
    cached = ROUTE_CACHE.get(key)
    if cached:
        return cached
    if ROUTER_ENABLED:
        url = (
            f"{ROUTER_URL}/{origin[1]:.7f},{origin[0]:.7f};"
            f"{destination[1]:.7f},{destination[0]:.7f}"
        )
        try:
            timeout = ClientTimeout(total=8)
            async with ClientSession(timeout=timeout) as session:
                async with session.get(
                    url,
                    params={"overview": "full", "geometries": "polyline", "steps": "false"},
                ) as response:
                    payload = await response.json(content_type=None)
            route = (payload.get("routes") or [None])[0]
            if response.status == 200 and route and route.get("geometry"):
                result = {
                    "polyline": route["geometry"],
                    "distance": round(float(route["distance"]) / 1000.0, 3),
                    "duration": int(round(float(route["duration"]))),
                    "source": "osrm",
                }
                ROUTE_CACHE[key] = result
                log_event("route_osrm", origin=origin, destination=destination, result=result)
                return result
        except Exception as exc:
            log_event("route_osrm_error", origin=origin, destination=destination, error=str(exc))
    result = fallback_route_details(origin, destination)
    ROUTE_CACHE[key] = result
    log_event("route_fallback", origin=origin, destination=destination, result=result)
    return result


def _coord(value):
    if not isinstance(value, dict):
        return None
    position = value.get("position")
    if isinstance(position, dict):
        lat, lng = position.get("lat"), position.get("lng")
    else:
        coords = value.get("coords")
        if isinstance(coords, dict):
            lat, lng = coords.get("lat"), coords.get("lng")
        else:
            lat, lng = value.get("lat"), value.get("lng")
    if lat is None or lng is None:
        return None
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return None
    address = value.get("formattedAddress") or value.get("nome") or "Local no mapa"
    return {
        "nome": address,
        "formattedAddress": address,
        "position": {"lat": lat, "lng": lng},
        "coords": {"lat": lat, "lng": lng},
        "latitude": lat,
        "longitude": lng,
    }


def current_race_payload(race):
    origin = race.get("origin") or _coord({
        "formattedAddress": "Av. Alm. Barroso, 472 - Centro",
        "position": {"lat": -22.9068, "lng": -43.1728983},
    })
    destination = race.get("destination") or _coord({
        "formattedAddress": "R. Pedro I, 19 - Centro",
        "position": {"lat": -22.9078736, "lng": -43.1823585},
    })
    return {
        "raceId": race.get("raceId"),
        "statusId": race.get("statusId", 100),
        "typeOfCall": race.get("typeOfCall", "app"),
        "driver": race.get("driver"),
        "city": {"cityId": "1", "cityName": "Rio de Janeiro"},
        "geolocationData": {"origin": origin, "destination": destination},
        "origin": origin,
        "destination": destination,
        "routeOriginDestination": race.get("routeOriginDestination"),
        "routeDriverPassenger": race.get("routeDriverPassenger"),
        "raceDiscount": race.get("raceDiscount") or {"fare": "Tarifa Normal", "flag": "Bandeira 1"},
        "urlShareRace": "https://fake.taxi.rio/race/fake-race-1",
        "paymentMethod": race.get("paymentMethod") or {"pindex": 0, "paymentId": "money"},
        "cityId": "1",
        "cityName": "Rio de Janeiro",
        "distance": {"value": 12000},
        "time": {"value": 1800},
        "estimatedPrice": race.get("estimatedPrice", "20.00"),
        "priceToPay": race.get("priceToPay", "20.00"),
        "total": race.get("total", "20.00"),
        "discount": race.get("discount", "0.00"),
        "minPrice": race.get("minPrice", "0.00"),
        "tolls": race.get("tolls", []),
        "invalid": race.get("invalid", False),
        "suspect": race.get("suspect", False),
    }


def passenger_payload():
    p = {
        "passengerId": "fake-passenger-1",
        "statusId": 99,
        "typeOfCall": None,
        "currentRace": None,
        "associatedPaymentMethod": dict(STATE["payment"]),
        "isAbleToUsePaymentInApp": True,
        "user": dict(STATE["user"]),
        "city": {"cityId": "1", "name": "Rio de Janeiro"},
        "raceDiscount": None,
    }
    if STATE["race"]:
        cur = current_race_payload(STATE["race"])
        p["currentRace"] = cur
        p["statusId"] = cur["statusId"]
        p["typeOfCall"] = cur["typeOfCall"]
        p["driver"] = cur["driver"]
    return p


def synthetic_route(origin):
    lat = float(origin["latitude"])
    lng = float(origin["longitude"])
    coordinates = [
        (lat, lng),
        (lat + 0.004, lng + 0.004),
        (lat + 0.008, lng + 0.008),
    ]
    return {
        "distance": {"value": 1200, "text": "1.2 km"},
        "duration": {"value": 300, "text": "5 min"},
        "polyline": encode_polyline(coordinates),
        "origin": origin,
        "destination": _coord({
            "formattedAddress": "Destino sintético",
            "position": {"lat": coordinates[-1][0], "lng": coordinates[-1][1]},
        }),
    }


def race_payload(data=None):
    data = data if isinstance(data, dict) else {}
    geo = data.get("geoLocationData") if isinstance(data.get("geoLocationData"), dict) else {}
    origin = _coord(geo.get("origin")) or _coord({
        "formattedAddress": "Praca Floriano, Centro, Rio de Janeiro - RJ",
        "position": {"lat": -22.9068, "lng": -43.1729},
    })
    destination = _coord(geo.get("destination")) or _coord({
        "formattedAddress": "Copacabana, Rio de Janeiro - RJ",
        "position": {"lat": -22.9711, "lng": -43.1822},
    })
    posted_route = data.get("routeOriginDestination")
    posted_distance = 0
    if isinstance(posted_route, dict):
        posted_distance = float((posted_route.get("distance") or {}).get("value", 0) or 0)
    if isinstance(posted_route, dict) and posted_distance > 0:
        route = dict(posted_route)
        route.setdefault("origin", origin)
        route.setdefault("destination", destination)
    elif posted_distance <= 0:
        route = synthetic_route(origin)
    else:
        fallback = fallback_route_details(
            (origin["latitude"], origin["longitude"]),
            (destination["latitude"], destination["longitude"]),
        )
        route = {
            "distance": {"value": round(fallback["distance"] * 1000), "text": f"{fallback['distance']:.1f} km"},
            "duration": {"value": fallback["duration"], "text": f"{max(1, round(fallback['duration'] / 60))} min"},
            "polyline": fallback["polyline"],
            "origin": origin,
            "destination": destination,
        }
    payment = data.get("associatedPaymentMethod") if isinstance(data.get("associatedPaymentMethod"), dict) else {"pindex": 0, "paymentId": "money"}
    discount = data.get("raceDiscount") if isinstance(data.get("raceDiscount"), dict) else {"id": "59c424f09c4b6aa933bbed93", "fare": "Tarifa Normal"}
    return {
        "raceId": "fake-race-1",
        "statusId": 100,
        "typeOfCall": "onStreet" if data.get("typeOfCall") == "onStreet" else "app",
        "driver": None,
        "currentRace": None,
        "routeOriginDestination": route,
        "raceDiscount": {"id": discount.get("id"), "fare": discount.get("fare", "Tarifa Normal"), "flag": "Bandeira 1"},
        "paymentMethod": payment,
        "cityId": "1",
        "cityName": "Rio de Janeiro",
        "origin": origin,
        "destination": destination,
        "distance": route.get("distance", {"value": 12000}),
        "time": route.get("duration", {"value": 1800}),
        "timeOut": "60",
        "estimatedPrice": "20.00",
        "priceToPay": "20.00",
        "total": "20.00",
        "discount": "0.00",
        "minPrice": "0.00",
        "tolls": [],
        "invalid": False,
        "suspect": False,
        "urlShareRace": "https://fake.taxi.rio/race/fake-race-1",
    }


async def rtdb_request(method, path, value=None):
    url = f"{RTDB_URL}/{path}.json?ns={RTDB_NS}"
    try:
        timeout = ClientTimeout(total=3)
        async with ClientSession(timeout=timeout) as session:
            if method == "DELETE":
                async with session.delete(url) as response:
                    return response.status
            if method == "PUT":
                async with session.put(url, json=value) as response:
                    return response.status
            async with session.get(url) as response:
                if response.status != 200:
                    return None
                return await response.json(content_type=None)
    except Exception as exc:
        log_event("rtdb_error", path=path, error=str(exc))
        return None


async def clear_chat(race_id):
    await rtdb_request("DELETE", f"race-chat/release/{race_id}")


async def seed_driver_welcome(race_id):
    now = now_ms()
    message = {
        "messageCode": f"welcome-{now}",
        "messageText": "Olá! Estou a caminho.",
        "read": False,
        "time": now,
    }
    await rtdb_request(
        "PUT",
        f"race-chat/release/{race_id}/Passenger/{message['messageCode']}",
        message,
    )
    log_event("chat_seeded", raceId=race_id, message=message)


async def chat_bridge_loop():
    if not CHAT_BRIDGE:
        return
    await asyncio.sleep(1)
    log.info("chat bridge enabled; RTDB=%s", RTDB_URL)
    while True:
        await asyncio.sleep(1)
        race = STATE["race"]
        if not race:
            continue
        race_id = race.get("raceId")
        if not race_id:
            continue
        messages = await rtdb_request(
            "GET", f"race-chat/release/{race_id}/Driver"
        )
        if not isinstance(messages, dict):
            continue
        for key, message in messages.items():
            if key in STATE["chat_seen"] or not isinstance(message, dict):
                continue
            STATE["chat_seen"].add(key)
            text = message.get("messageText")
            if not isinstance(text, str) or not text.strip():
                continue
            reply = {
                "messageCode": f"driver-{key}",
                "messageText": f"Recebido: {text}",
                "read": False,
                "time": now_ms(),
            }
            await rtdb_request(
                "PUT",
                f"race-chat/release/{race_id}/Passenger/{reply['messageCode']}",
                reply,
            )
            log_event("chat_driver_reply", raceId=race_id, message=reply)


async def ws_send(client, status_id, payload):
    try:
        await client.send_str(json.dumps({"statusId": status_id, "payload": payload}))
        log_event("ws_sent", statusId=status_id, payload=payload)
    except Exception as e:
        log_event("ws_send_error", error=str(e))


async def ws_broadcast(status_id, payload):
    for client in list(STATE["ws_clients"]):
        await ws_send(client, status_id, payload)


def invalidate_ride():
    task = STATE["ride_task"]
    if task and task is not asyncio.current_task() and not task.done():
        task.cancel()
    STATE["ride_task"] = None
    STATE["generation"] += 1
    return STATE["generation"]


def final_race_payload(race, driver):
    total = 30.36
    fare_label = (race.get("raceDiscount") or {}).get("fare") or "Tarifa Normal"
    percent = 0.0
    if isinstance(fare_label, str) and fare_label.endswith("%"):
        try:
            percent = float(fare_label[:-1]) / 100.0
        except ValueError:
            percent = 0.0
    discount = round(total * percent, 2)
    price = round(total - discount, 2)
    fmt = lambda value: f"{value:.2f}".replace(".", ",")
    return {
        "geolocationData": race.get("geolocationData") or {
            "origin": race.get("origin"),
            "destination": race.get("destination"),
        },
        "raceDiscount": race.get("raceDiscount") or {"fare": "Tarifa Normal", "flag": "Bandeira 1"},
        "discount": fmt(discount),
        "discountValue": fmt(price),
        "total": fmt(total),
        "priceToPay": fmt(price),
        "raceId": race.get("raceId"),
        "tolls": [],
        "invalid": False,
        "suspect": False,
        "driver": {
            "displayName": driver.get("displayName", "Motorista Fake"),
            "carModel": driver.get("carModel", "Fake Car"),
            "carLicensePlate": driver.get("carLicensePlate", "FAKE123"),
        },
        "associatedPaymentMethod": race.get("paymentMethod") or {"pindex": 1, "name": "Dinheiro"},
    }


async def simulate_complete_run(generation, driver, race):
    route = race.get("routeOriginDestination") or {}
    coordinates = decode_polyline(route.get("polyline", ""))
    origin = race.get("origin") or {}
    destination = race.get("destination") or {}
    origin_point = origin.get("position") or {}
    destination_point = destination.get("position") or {}
    if not coordinates:
        coordinates = [
            (float(origin_point.get("lat", -22.9068)), float(origin_point.get("lng", -43.1729))),
            (
                float(destination_point.get("lat", -22.9711)),
                float(destination_point.get("lng", -43.1822)),
            ),
        ]
    if len(coordinates) < 2:
        coordinates = coordinates * 2

    total_distance = float((route.get("distance") or {}).get("value", 0) or 0)
    total_duration = float((route.get("duration") or {}).get("value", 0) or 0)
    steps = min(14, max(8, len(coordinates)))
    sent_route_update = False

    for step in range(1, steps + 1):
        if generation != STATE["generation"] or not STATE["race"]:
            return
        await asyncio.sleep(1.0 if step > 1 else 0.8)
        if generation != STATE["generation"] or not STATE["race"]:
            return
        index = min(len(coordinates) - 1, round(step * (len(coordinates) - 1) / steps))
        lat, lng = coordinates[index]
        driver["position"] = {"lat": lat, "lng": lng}
        current = STATE["race"]
        current["driver"] = driver
        current["statusId"] = 112
        await ws_broadcast(102, {
            "position": {"lat": lat, "lng": lng},
            "isFromReactNative": False,
        })
        if not sent_route_update and step >= steps // 2:
            remaining = coordinates[index:]
            if len(remaining) < 2:
                remaining = [coordinates[index], coordinates[-1]]
            fraction = 1 - (step / steps)
            await ws_broadcast(213, {
                "polyline": encode_polyline(remaining),
                "distance": round(total_distance * fraction / 1000.0, 3),
                "duration": max(0.1, round((total_duration / 60.0) * fraction, 3)),
            })
            sent_route_update = True

    await asyncio.sleep(1)
    if generation != STATE["generation"] or not STATE["race"]:
        return
    final_race = dict(STATE["race"])
    final_race.update({"statusId": 114, "driver": driver})
    final_race["driver"] = dict(driver, position={
        "lat": coordinates[-1][0],
        "lng": coordinates[-1][1],
    })
    STATE["race"] = final_race
    if not any(r.get("raceId") == final_race.get("raceId") for r in STATE["history"]):
        STATE["history"].insert(0, current_race_payload(final_race))
    await ws_broadcast(113, final_race_payload(final_race, driver))


async def simulate_ride(generation):
    await asyncio.sleep(2)
    race = STATE["race"]
    if generation != STATE["generation"] or not race:
        return
    await ws_broadcast(100, {"currentRace": race, "statusId": 100})
    scenario = STATE["scenario"]
    if scenario == "no_driver":
        return
    if scenario == "ws_payment_refused":
        await ws_broadcast(90, {"refuseReason": "fake-payment-refused"})
        return

    await asyncio.sleep(2)
    race = STATE["race"]
    if generation != STATE["generation"] or not race:
        return
    driver = fake_driver()
    race111 = dict(race)
    race111.update({
        "statusId": 111,
        "driver": driver,
        "routeDriverPassenger": race["routeOriginDestination"],
    })
    STATE["race"] = race111
    await ws_broadcast(111, {
        "driver": driver,
        "routeDriverPassenger": race["routeOriginDestination"],
        "currentRace": race111,
        "statusId": 111,
    })
    if scenario not in ("in_race", "finished", "complete_run"):
        return

    await asyncio.sleep(3)
    race = STATE["race"]
    if generation != STATE["generation"] or not race:
        return
    race112 = dict(race)
    race112.update({"statusId": 112, "driver": driver})
    STATE["race"] = race112
    await ws_broadcast(112, {
        "driver": {
            "driverType": "",
            "geolocationData": {
                "origin": race.get("origin"),
                "destination": race.get("destination"),
            },
        },
        "routeOriginDestination": race["routeOriginDestination"],
    })
    if scenario == "complete_run":
        await simulate_complete_run(generation, driver, race112)
        return
    await asyncio.sleep(3)
    if generation != STATE["generation"] or not STATE["race"]:
        return
    await ws_broadcast(102, {
        "position": {"lat": -22.95, "lng": -43.18},
        "isFromReactNative": False,
    })
    await asyncio.sleep(2)
    if generation != STATE["generation"] or not STATE["race"]:
        return
    route = STATE["race"].get("routeOriginDestination") or {}
    await ws_broadcast(213, {
        "polyline": route.get("polyline", ""),
        "distance": round(float((route.get("distance") or {}).get("value", 12000) or 0) / 1000.0, 3),
        "duration": max(0.1, round(float((route.get("duration") or {}).get("value", 1800) or 0) / 60.0, 3)),
    })
    if scenario != "finished":
        return
    await asyncio.sleep(2)
    race = STATE["race"]
    if generation != STATE["generation"] or not race:
        return
    race113 = dict(race)
    race113.update({"statusId": 113, "driver": driver})
    STATE["race"] = race113
    if not any(r.get("raceId") == race113.get("raceId") for r in STATE["history"]):
        STATE["history"].insert(0, current_race_payload(race113))
    await ws_broadcast(113, final_race_payload(race113, driver))


def start_ride():
    generation = invalidate_ride()
    STATE["ride_task"] = asyncio.create_task(simulate_ride(generation))


def authorized(request):
    if not AUTH_REQUIRED or request.path in PUBLIC_PATHS:
        return True
    if request.path.startswith("/_control/"):
        return True
    return request.headers.get("Authorization", "") == f"Bearer {STATE['token']}"


def control_state():
    return {
        "scenario": STATE["scenario"],
        "token": STATE["token"],
        "race": STATE["race"],
        "historyCount": len(STATE["history"]),
        "wsClients": len(STATE["ws_clients"]),
        "ratings": STATE["ratings"],
        "authStatus": STATE["auth_status"],
        "signupStatus": STATE["signup_status"],
        "cancelMode": STATE["cancel_mode"],
        "createMode": STATE["create_mode"],
        "payment": STATE["payment"],
        "user": dict(STATE["user"]),
    }


def _update_history_rating(race_id, rating):
    for item in STATE["history"]:
        if item.get("raceId") == race_id:
            item.update(rating)
            return
    if STATE["race"] and STATE["race"].get("raceId") == race_id:
        item = current_race_payload(STATE["race"])
        item.update(rating)
        STATE["history"].insert(0, item)


async def handle(request: web.Request):
    if request.headers.get("Upgrade", "").lower() == "websocket":
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        STATE["ws_clients"].add(ws)
        log_event("ws_open", path=request.path, headers={k: v for k, v in request.headers.items() if k.lower() in ("authorization", "user-agent", "host")})
        try:
            async for msg in ws:
                if msg.type == web.WSMsgType.TEXT:
                    log_event("ws_message", path=request.path, text=msg.data)
                elif msg.type == web.WSMsgType.ERROR:
                    log_event("ws_error", error=str(ws.exception()))
        finally:
            STATE["ws_clients"].discard(ws)
            log_event("ws_close", path=request.path)
        return ws

    body_raw = await request.read()
    try:
        body = json.loads(body_raw) if body_raw else None
    except Exception:
        body = body_raw.decode("utf-8", "replace")
    log_event(
        "http",
        method=request.method,
        path=request.path,
        query=dict(request.query),
        headers={k: v for k, v in request.headers.items() if k.lower() in ("authorization", "passengerinfo", "content-type", "user-agent", "host")},
        body=body,
    )

    path = request.path
    method = request.method
    allowed = ROUTES.get(path)
    if allowed is None:
        return web.json_response({"message": "unknown fake route", "path": path}, status=404)
    if method not in allowed:
        return web.json_response(
            {"message": "method not allowed", "path": path, "allowed": sorted(allowed)},
            status=405,
            headers={"Allow": ", ".join(sorted(allowed))},
        )
    if not authorized(request):
        return web.json_response({"message": "Token de autenticação inválido"}, status=401)

    if path == "/_control/state":
        return web.json_response(control_state())
    if path == "/_control/reset":
        STATE["race"] = None
        STATE["history"] = []
        STATE["ratings"] = {}
        STATE["chat_seen"].clear()
        STATE["auth_status"] = int(os.environ.get("FAKE_AUTH_STATUS", "201"))
        STATE["signup_status"] = int(os.environ.get("FAKE_SIGNUP_STATUS", "200"))
        STATE["cancel_mode"] = "normal"
        STATE["create_mode"] = "normal"
        STATE["payment"] = {"pindex": 1, "paymentId": "money", "name": "Dinheiro"}
        STATE["user"].update({
            "userId": "fake-user-1",
            "fullName": "Passageiro Fake",
            "displayName": "Fake",
            "email": "fake@example.com",
            "phoneNumber": "21999999999",
            "cpf": "00000000000",
        })
        STATE["scenario"] = DEFAULT_SCENARIO if DEFAULT_SCENARIO in SCENARIOS else "accept"
        invalidate_ride()
        return web.json_response(control_state())
    if path == "/_control/scenario":
        name = body.get("name") if isinstance(body, dict) else None
        if name not in SCENARIOS:
            return web.json_response({"message": "unknown scenario", "scenarios": sorted(SCENARIOS)}, status=400)
        STATE["scenario"] = name
        return web.json_response(control_state())
    if path == "/_control/signup_status":
        status = body.get("status") if isinstance(body, dict) else None
        if status not in (200, 400, 409, 500):
            return web.json_response({"message": "status must be 200, 400, 409, or 500"}, status=400)
        STATE["signup_status"] = status
        return web.json_response(control_state())
    if path == "/_control/auth_status":
        status = body.get("status") if isinstance(body, dict) else None
        if status not in (200, 201, 202):
            return web.json_response({"message": "status must be 200, 201, or 202"}, status=400)
        STATE["auth_status"] = status
        return web.json_response(control_state())
    if path == "/_control/ws":
        if not isinstance(body, dict) or not isinstance(body.get("statusId"), int):
            return web.json_response({"message": "statusId must be an integer"}, status=400)
        await ws_broadcast(body["statusId"], body.get("payload", {}))
        return web.json_response({"sent": body["statusId"]})
    if path == "/_control/drop_ws":
        clients = list(STATE["ws_clients"])
        STATE["ws_clients"].clear()
        for client in clients:
            await client.close()
        return web.json_response({"dropped": len(clients)})
    if path == "/_control/race":
        data = body if isinstance(body, dict) else {}
        if data.get("clear"):
            STATE["race"] = None
            invalidate_ride()
            return web.json_response(control_state())
        status_id = data.get("statusId")
        if not isinstance(status_id, int):
            return web.json_response({"message": "statusId must be an integer"}, status=400)
        race = STATE["race"]
        if not isinstance(race, dict):
            return web.json_response({"message": "no current race"}, status=409)
        race["statusId"] = status_id
        if data.get("broadcast"):
            await ws_broadcast(status_id, {"currentRace": current_race_payload(race), "statusId": status_id})
        return web.json_response(control_state())
    if path == "/_control/cancel_mode":
        mode = body.get("mode") if isinstance(body, dict) else None
        if mode not in ("normal", "no_103", "no_cancelable", "server_error", "timeout"):
            return web.json_response({"message": "invalid cancel mode"}, status=400)
        STATE["cancel_mode"] = mode
        return web.json_response(control_state())
    if path == "/_control/payment":
        data = body if isinstance(body, dict) else {}
        pindex = data.get("pindex")
        if not isinstance(pindex, int):
            return web.json_response({"message": "pindex must be an integer"}, status=400)
        STATE["payment"] = {
            "pindex": pindex,
            "paymentId": data.get("paymentId") or ("money" if pindex == 1 else "fake-payment-1"),
            "name": data.get("name") or ("Dinheiro" if pindex == 1 else "Cartão de Crédito"),
        }
        return web.json_response(control_state())
    if path == "/_control/create_mode":
        mode = body.get("mode") if isinstance(body, dict) else None
        if mode not in ("normal", "no_race_id", "immediate_111", "silent_111", "timeout"):
            return web.json_response({"message": "invalid create mode"}, status=400)
        STATE["create_mode"] = mode
        return web.json_response(control_state())

    if path == "/auth/checkMinimumAppVersion":
        return web.json_response({"needsUpdate": False})
    if path == "/auth/authPassenger":
        status = STATE["auth_status"]
        payload = {"oldPhoneNumber": STATE["user"]["phoneNumber"]} if status == 202 else {}
        return web.json_response(payload, status=status)
    if path in ("/auth/signIn", "/auth/loginRecovery"):
        return web.json_response({"token": STATE["token"]}, status=200)
    if path == "/auth/signUp":
        status = STATE["signup_status"]
        if status == 200:
            return web.json_response({"token": STATE["token"]}, status=200)
        messages = {
            400: "Dados de cadastro inválidos",
            409: "Conta já cadastrada",
            500: "Erro interno ao cadastrar",
        }
        return web.json_response({"message": messages[status]}, status=status)
    if path in (
        "/auth/verifySmsCode",
        "/auth/verifyEmailCode",
        "/auth/sendNewSmsCode",
        "/auth/sendNewWhatsAppCode",
        "/auth/sendEmailCode",
    ):
        return web.json_response({}, status=200)

    if path == "/accountrecovery/sendvalidationcode":
        return web.json_response({}, status=200)
    if path == "/accountrecovery/verifyvalidationcode":
        return web.json_response({}, status=200)
    if path == "/account/updatePassengerAndUserData":
        if isinstance(body, dict):
            for key in ("fullName", "displayName", "email", "phoneNumber"):
                value = body.get(key)
                if isinstance(value, str) and value.strip():
                    STATE["user"][key] = value.strip()
        return web.json_response({"isSendedSmsCode": False}, status=200)
    if path == "/account/updatePhoneNumber":
        return web.json_response({}, status=200)

    if path == "/aboutme/aboutMePassenger":
        return web.json_response({"payload": passenger_payload()}, status=200)
    if path == "/aboutme/getMyOriginCity":
        return web.json_response({
            "cityId": "1",
            "name": "Rio de Janeiro",
            "isAbleToUsePaymentInApp": True,
        }, status=200)
    if path == "/aboutme/getUpdatedCreditCards":
        return web.json_response({"payload": [], "creditCards": []}, status=200)
    if path in (
        "/aboutme/savePushToken",
        "/aboutme/setMyPaymentMethod",
        "/aboutme/removeCreditCard",
    ):
        return web.json_response({}, status=200)

    if path == "/races/getAutocompleteRadius":
        return web.json_response({"radius": 1000}, status=200)
    if path == "/races/getRouteDetails":
        try:
            origin = parse_lat_lng(request.query.get("origin"))
            destination = parse_lat_lng(request.query.get("destination"))
        except (TypeError, ValueError) as exc:
            return web.json_response({"message": f"invalid route coordinates: {exc}"}, status=400)
        details = await local_route_details(origin, destination)
        return web.json_response({
            "polyline": details["polyline"],
            "distance": details["distance"],
            "duration": details["duration"],
            "origin": {"lat": origin[0], "lng": origin[1]},
            "destination": {"lat": destination[0], "lng": destination[1]},
            "source": details["source"],
        }, status=200)
    if path == "/races/raceHistory":
        return web.json_response({
            "races": STATE["history"],
            "total": len(STATE["history"]),
            "currentPage": 1,
        }, status=200)
    if path == "/races/raceHistoryById":
        race_id = request.query.get("raceId")
        for item in STATE["history"]:
            if item.get("raceId") == race_id:
                return web.json_response(item, status=200)
        return web.json_response(race_payload(), status=200)
    if path in ("/races/fares", "/races/onStreetFares"):
        return web.json_response([
            {
                "fare": fare,
                "flag": flag,
                "discountId": discount_id,
                "amountOfDrivers": drivers,
                "numberOfCars": 3,
                "estimatedPrice": price,
                "paymentMethod": {
                    "pindex": 1,
                    "name": "Dinheiro",
                    "type": "Pagamento no táxi",
                    "active": True,
                    "paymentMethodId": "5a26ecd5b3e31e6203d0ac11",
                },
            }
            for fare, flag, discount_id, price, drivers in DISCOUNTS
        ], status=200)

    if path in ("/races/create", "/races/createOnStreet"):
        if STATE["scenario"] == "create_payment_refused":
            return web.json_response({"message": "Pagamento recusado"}, status=402)
        payload = body if isinstance(body, dict) else None
        race = race_payload(payload)
        if path.endswith("OnStreet"):
            race["typeOfCall"] = "onStreet"
        STATE["race"] = race
        log_event("ride_created", race=race, scenario=STATE["scenario"], createMode=STATE["create_mode"])
        await clear_chat(race["raceId"])
        await seed_driver_welcome(race["raceId"])
        if STATE["create_mode"] in ("immediate_111", "silent_111"):
            driver = fake_driver()
            race.update({
                "statusId": 111,
                "driver": driver,
                "routeDriverPassenger": race["routeOriginDestination"],
            })
            STATE["race"] = race
            response = dict(race)
            if STATE["create_mode"] == "silent_111":
                response["statusId"] = 100
            return web.json_response(response, status=202)
        if STATE["create_mode"] == "timeout":
            start_ride()
            await asyncio.sleep(12)
            return web.json_response(dict(race), status=202)
        start_ride()
        response = dict(race)
        if STATE["create_mode"] == "no_race_id":
            response.pop("raceId", None)
        return web.json_response(response, status=202)

    if path == "/races/cancel":
        mode = STATE["cancel_mode"]
        if mode == "no_cancelable":
            return web.json_response(
                {"message": "Nenhuma corrida que possa ser cancelada foi encontrada para esse passageiro"},
                status=400,
            )
        if mode == "server_error":
            return web.json_response({"message": "Erro interno ao cancelar"}, status=500)
        STATE["race"] = None
        invalidate_ride()
        log_event("ride_cancelled", mode=mode)
        if mode == "timeout":
            await asyncio.sleep(12)
            return web.json_response({}, status=200)
        if mode != "no_103":
            asyncio.create_task(ws_broadcast(103, {"currentRace": None, "statusId": 103}))
        return web.json_response({}, status=200)

    if path == "/races/notRating":
        race = STATE["race"] or {}
        race_id = race.get("raceId", "fake-race-1")
        STATE["ratings"][race_id] = {"skipped": True, "time": now_ms()}
        _update_history_rating(race_id, {"skipped": True})
        STATE["race"] = None
        invalidate_ride()
        log_event("ride_not_rated", raceId=race_id)
        asyncio.create_task(ws_broadcast(103, {"currentRace": None, "statusId": 103}))
        return web.json_response({}, status=200)

    if path == "/races/rating":
        race = STATE["race"] or {}
        race_id = race.get("raceId", "fake-race-1")
        data = body if isinstance(body, dict) else {}
        rating = int(data.get("ratingSelected") or 0)
        comment = data.get("comment") or ""
        STATE["ratings"][race_id] = {
            "ratingSelected": rating,
            "comment": comment,
            "skipped": False,
            "time": now_ms(),
        }
        _update_history_rating(race_id, STATE["ratings"][race_id])
        log_event("ride_rated", raceId=race_id, ratingSelected=rating, comment=comment)
        return web.json_response({}, status=200)

    if path in ("/races/updateRating", "/races/updateComment"):
        data = body if isinstance(body, dict) else {}
        race_id = data.get("raceId")
        if not race_id:
            return web.json_response({"message": "raceId required"}, status=400)
        current = STATE["ratings"].setdefault(race_id, {})
        if path.endswith("Rating"):
            current["ratingSelected"] = int(data.get("ratingSelected") or 0)
        else:
            current["comment"] = data.get("comment") or ""
        _update_history_rating(race_id, current)
        log_event("rating_updated", path=path, data=data)
        return web.json_response({}, status=200)

    if path == "/races/sendMessageToDriver":
        data = body if isinstance(body, dict) else {}
        log_event("chat_rest_send", body=data)
        return web.json_response({"message": "Mensagem enviada com sucesso"}, status=200)

    if path in (
        "/races/sendContactUs",
        "/races/addPassengerUserName",
        "/races/addCpf",
    ):
        return web.json_response({}, status=200)

    return web.json_response({"message": "unhandled fake route", "path": path}, status=500)


async def main():
    app = web.Application()
    app.router.add_route("*", "/{tail:.*}", handle)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", PORT)
    await site.start()
    log.info("fake server listening on 127.0.0.1:%s auth_required=%s scenario=%s", PORT, AUTH_REQUIRED, STATE["scenario"])
    bridge = asyncio.create_task(chat_bridge_loop())
    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())

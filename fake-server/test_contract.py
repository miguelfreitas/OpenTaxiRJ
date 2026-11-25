#!/usr/bin/env python3
import asyncio
import json
import os
import socket
import subprocess
import sys
import unittest
from pathlib import Path

import aiohttp

ROOT = Path(__file__).parent
AUTH = {"Authorization": "Bearer fake-token"}


def decode_polyline(value):
    points = []
    index = 0
    lat = 0
    lng = 0
    while index < len(value):
        result = 0
        shift = 0
        while True:
            byte = ord(value[index]) - 63
            index += 1
            result |= (byte & 0x1F) << shift
            shift += 5
            if byte < 0x20:
                break
        lat += ~(result >> 1) if result & 1 else result >> 1

        result = 0
        shift = 0
        while True:
            byte = ord(value[index]) - 63
            index += 1
            result |= (byte & 0x1F) << shift
            shift += 5
            if byte < 0x20:
                break
        lng += ~(result >> 1) if result & 1 else result >> 1
        points.append((lat / 1e5, lng / 1e5))
    return points


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class FakeContractTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.port = free_port()
        self.base = f"http://127.0.0.1:{self.port}"
        env = os.environ.copy()
        env.update({
            "FAKE_PORT": str(self.port),
            "FAKE_REQUIRE_AUTH": "1",
            "FAKE_DISABLE_ROUTER": "1",
            "FAKE_CHAT_BRIDGE": "0",
            "RIDE_SCENARIO": "accept",
        })
        self.proc = subprocess.Popen(
            [sys.executable, str(ROOT / "server.py")],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        for _ in range(100):
            try:
                reader, writer = await asyncio.open_connection("127.0.0.1", self.port)
                writer.close()
                await writer.wait_closed()
                break
            except OSError:
                await asyncio.sleep(0.05)
        else:
            self.fail("fake server did not start")
        self.session = aiohttp.ClientSession()

    async def asyncTearDown(self):
        await self.session.close()
        self.proc.terminate()
        try:
            await asyncio.to_thread(self.proc.wait, 3)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            await asyncio.to_thread(self.proc.wait)

    async def post(self, path, body=None, auth=True):
        headers = AUTH if auth else {}
        async with self.session.post(self.base + path, json=body, headers=headers) as r:
            return r.status, await r.json(content_type=None)

    async def get(self, path, auth=True):
        headers = AUTH if auth else {}
        async with self.session.get(self.base + path, headers=headers) as r:
            return r.status, await r.json(content_type=None)

    async def reset(self, scenario="accept"):
        status, _ = await self.post("/_control/reset")
        self.assertEqual(status, 200)
        status, body = await self.post("/_control/scenario", {"name": scenario})
        self.assertEqual(status, 200, body)
        return body

    async def test_strict_routing_and_auth(self):
        status, body = await self.get("/nope")
        self.assertEqual(status, 404, body)
        status, body = await self.post("/auth/checkMinimumAppVersion")
        self.assertEqual(status, 405, body)
        status, body = await self.get("/aboutme/aboutMePassenger", auth=False)
        self.assertEqual(status, 401, body)
        status, body = await self.post("/auth/signIn", {}, auth=False)
        self.assertEqual(status, 200, body)
        self.assertEqual(body["token"], "fake-token")

    async def receive_statuses(self, ws, count, timeout=8):
        out = []
        for _ in range(count):
            msg = await asyncio.wait_for(ws.receive(), timeout)
            self.assertEqual(msg.type, aiohttp.WSMsgType.TEXT)
            out.append(json.loads(msg.data)["statusId"])
        return out

    async def receive_events(self, ws, count, timeout=8):
        out = []
        for _ in range(count):
            msg = await asyncio.wait_for(ws.receive(), timeout)
            self.assertEqual(msg.type, aiohttp.WSMsgType.TEXT)
            out.append(json.loads(msg.data))
        return out

    async def test_auth_and_profile_session(self):
        await self.reset()
        status, body = await self.post("/_control/auth_status", {"status": 201})
        self.assertEqual(status, 200, body)
        status, body = await self.post(
            "/auth/authPassenger",
            {"login": "fake@example.com", "phoneNumber": "21999999999"},
            auth=False,
        )
        self.assertEqual(status, 201, body)

        status, body = await self.post(
            "/auth/signIn",
            {
                "login": "fake@example.com",
                "phoneNumber": "21999999999",
                "smsCode": "123456",
                "cityId": "1",
            },
            auth=False,
        )
        self.assertEqual(status, 200, body)
        self.assertEqual(body["token"], "fake-token", body)

        status, body = await self.get("/aboutme/aboutMePassenger")
        self.assertEqual(status, 200, body)
        self.assertEqual(body["payload"]["user"]["fullName"], "Passageiro Fake", body)

        update = {
            "fullName": "Maria da Silva",
            "displayName": "Maria",
            "email": "maria@example.com",
            "phoneNumber": "21988887777",
        }
        status, body = await self.post("/account/updatePassengerAndUserData", update)
        self.assertEqual(status, 200, body)

        status, body = await self.get("/aboutme/aboutMePassenger")
        self.assertEqual(status, 200, body)
        self.assertEqual(body["payload"]["user"]["fullName"], "Maria da Silva", body)
        self.assertEqual(body["payload"]["user"]["email"], "maria@example.com", body)
        self.assertEqual(body["payload"]["user"]["phoneNumber"], "21988887777", body)

    async def test_auth_status_branches(self):
        await self.reset()
        for expected in (200, 201, 202):
            status, body = await self.post("/_control/auth_status", {"status": expected})
            self.assertEqual(status, 200, body)
            status, body = await self.post(
                "/auth/authPassenger",
                {"login": "fake@example.com", "phoneNumber": "21999999999"},
                auth=False,
            )
            self.assertEqual(status, expected, body)
            if expected == 202:
                self.assertTrue(body.get("oldPhoneNumber"), body)
            else:
                self.assertEqual(body, {}, body)

        status, body = await self.post(
            "/auth/verifySmsCode",
            {"login": "fake@example.com", "phoneNumber": "21999999999", "smsCode": "123456"},
            auth=False,
        )
        self.assertEqual(status, 200, body)
        status, body = await self.post(
            "/auth/signUp",
            {
                "login": "fake@example.com",
                "phoneNumber": "21999999999",
                "smsCode": "123456",
                "fullName": "Maria da Silva",
                "displayName": "Maria",
            },
            auth=False,
        )
        self.assertEqual(status, 200, body)
        self.assertEqual(body["token"], "fake-token", body)
        status, body = await self.post("/_control/signup_status", {"status": 409})
        self.assertEqual(status, 200, body)
        status, body = await self.post(
            "/auth/signUp",
            {
                "login": "fake@example.com",
                "phoneNumber": "21999999999",
                "smsCode": "123456",
                "fullName": "Maria da Silva",
                "displayName": "Maria",
            },
            auth=False,
        )
        self.assertEqual(status, 409, body)
        status, body = await self.post("/_control/signup_status", {"status": 200})
        self.assertEqual(status, 200, body)
        status, body = await self.post(
            "/auth/sendNewWhatsAppCode", {"phoneNumber": "21999999999"}, auth=False
        )
        self.assertEqual(status, 200, body)
        status, body = await self.post(
            "/accountrecovery/sendvalidationcode", {"login": "fake@example.com"}, auth=False
        )
        self.assertEqual(status, 200, body)
        status, body = await self.post(
            "/accountrecovery/verifyvalidationcode",
            {
                "login": "fake@example.com",
                "validationCode": "ABC123",
                "phoneNumber": "21999999999",
                "oldPhoneNumber": "21988887777",
            },
            auth=False,
        )
        self.assertEqual(status, 200, body)

    async def test_route_details_and_discounts(self):
        status, body = await self.get(
            "/races/getRouteDetails?origin=-22.9068,-43.1728983"
            "&destination=-22.9078736,-43.1823585"
        )
        self.assertEqual(status, 200, body)
        self.assertTrue(body["polyline"], body)
        self.assertNotEqual(body["polyline"], "fake-polyline", body)
        self.assertGreater(len(decode_polyline(body["polyline"])), 1, body)
        self.assertGreater(body["distance"], 0, body)
        self.assertGreater(body["duration"], 0, body)

        status, fares = await self.post("/races/fares", {})
        self.assertEqual(status, 200, fares)
        self.assertEqual(len(fares), 5, fares)
        self.assertEqual(
            [item["fare"] for item in fares],
            ["Tarifa Normal", "10%", "20%", "30%", "40%"],
        )
        self.assertEqual(fares[0]["discountId"], "59c424f09c4b6aa933bbed93")

    async def test_create_echoes_route_and_discount(self):
        await self.reset("accept")
        polyline = "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
        body = {
            "associatedPaymentMethod": {"pindex": 0, "paymentId": "money"},
            "raceDiscount": {
                "id": "59c424f09c4b6aa933bbed95",
                "fare": "20%",
            },
            "geoLocationData": {
                "origin": {"formattedAddress": "Origem", "position": {"lat": -22.9, "lng": -43.2}},
                "destination": {"formattedAddress": "Destino", "position": {"lat": -22.95, "lng": -43.18}},
            },
            "routeOriginDestination": {
                "distance": {"value": 1234, "text": "1.2 km"},
                "duration": {"value": 600, "text": "10 min"},
                "polyline": polyline,
            },
        }
        status, race = await self.post("/races/create", body)
        self.assertEqual(status, 202, race)
        self.assertEqual(race["routeOriginDestination"]["polyline"], polyline, race)
        self.assertEqual(race["raceDiscount"]["id"], "59c424f09c4b6aa933bbed95", race)
        self.assertEqual(race["origin"]["formattedAddress"], "Origem", race)

    async def test_accept_then_cancel(self):
        await self.reset("accept")
        async with self.session.ws_connect(f"ws://127.0.0.1:{self.port}/", headers=AUTH) as ws:
            status, _ = await self.post("/races/create", {})
            self.assertEqual(status, 202)
            self.assertEqual(await self.receive_statuses(ws, 2), [100, 111])
            status, _ = await self.post("/races/cancel", {})
            self.assertEqual(status, 200)
            self.assertEqual(await self.receive_statuses(ws, 1), [103])

    async def test_driver_payload_parity(self):
        await self.reset("accept")
        async with self.session.ws_connect(f"ws://127.0.0.1:{self.port}/", headers=AUTH) as ws:
            status, _ = await self.post("/races/create", {})
            self.assertEqual(status, 202)
            self.assertEqual(await self.receive_statuses(ws, 1), [100])
            message = await asyncio.wait_for(ws.receive(), 8)
            self.assertEqual(message.type, aiohttp.WSMsgType.TEXT)
            event = json.loads(message.data)
            self.assertEqual(event["statusId"], 111)
            driver = event["payload"]["driver"]
            self.assertEqual(driver["displayName"], "Motorista Fake")
            self.assertEqual(driver["carLicensePlate"], "FAKE123")
            self.assertEqual(driver["phoneNumber"], "21999999999")
            self.assertEqual(
                driver["addressAcceptedRace"]["position"],
                {"lat": -22.9068, "lng": -43.1729},
            )
            self.assertTrue(event["payload"]["routeDriverPassenger"]["polyline"])

    async def test_in_race_sequence(self):
        await self.reset("in_race")
        async with self.session.ws_connect(f"ws://127.0.0.1:{self.port}/", headers=AUTH) as ws:
            status, _ = await self.post("/races/create", {})
            self.assertEqual(status, 202)
            self.assertEqual(
                await self.receive_statuses(ws, 5, timeout=15),
                [100, 111, 112, 102, 213],
            )

    async def test_finished_and_history(self):
        await self.reset("finished")
        async with self.session.ws_connect(f"ws://127.0.0.1:{self.port}/", headers=AUTH) as ws:
            status, _ = await self.post("/races/create", {})
            self.assertEqual(status, 202)
            self.assertEqual(
                await self.receive_statuses(ws, 6, timeout=18),
                [100, 111, 112, 102, 213, 113],
            )
        status, body = await self.get("/races/raceHistory")
        self.assertEqual(status, 200, body)
        self.assertEqual(body["total"], 1, body)

    async def test_real_213_and_final_113_shapes(self):
        await self.reset("finished")
        async with self.session.ws_connect(f"ws://127.0.0.1:{self.port}/", headers=AUTH) as ws:
            status, _ = await self.post("/races/create", {})
            self.assertEqual(status, 202)
            events = await self.receive_events(ws, 6, timeout=18)
        self.assertEqual(
            [event["statusId"] for event in events],
            [100, 111, 112, 102, 213, 113],
        )
        in_race = events[2]["payload"]["driver"]
        self.assertEqual(set(in_race), {"driverType", "geolocationData"})
        route_update = events[4]["payload"]
        self.assertLess(route_update["distance"], 5, route_update)
        self.assertLess(route_update["duration"], 15, route_update)
        final = events[5]["payload"]
        self.assertEqual(final["total"], "30,36", final)
        self.assertEqual(final["priceToPay"], "30,36", final)
        self.assertEqual(
            set(final["driver"]),
            {"displayName", "carModel", "carLicensePlate"},
            final,
        )

    async def test_complete_run_to_destination(self):
        await self.reset("complete_run")
        async with self.session.ws_connect(f"ws://127.0.0.1:{self.port}/", headers=AUTH) as ws:
            status, race = await self.post("/races/create", {})
            self.assertEqual(status, 202, race)
            statuses = []
            positions = []
            route_update = None
            final = None
            deadline = asyncio.get_running_loop().time() + 30
            while asyncio.get_running_loop().time() < deadline:
                remaining = max(0.1, deadline - asyncio.get_running_loop().time())
                msg = await asyncio.wait_for(ws.receive(), remaining)
                self.assertEqual(msg.type, aiohttp.WSMsgType.TEXT)
                event = json.loads(msg.data)
                statuses.append(event["statusId"])
                if event["statusId"] == 102:
                    positions.append(event["payload"]["position"])
                elif event["statusId"] == 213:
                    route_update = event["payload"]
                elif event["statusId"] == 113:
                    final = event["payload"]
                    break
            self.assertEqual(statuses[:3], [100, 111, 112], statuses)
            self.assertIn(213, statuses, statuses)
            self.assertGreaterEqual(statuses.count(102), 3, statuses)
            self.assertEqual(statuses[-1], 113, statuses)
            self.assertGreater(len(positions), 2, positions)
            self.assertNotEqual(positions[0], positions[-1], positions)
            self.assertIsNotNone(route_update, statuses)
            self.assertLess(route_update["distance"], 5, route_update)
            self.assertLess(route_update["duration"], 15, route_update)
            self.assertIsNotNone(final, statuses)
            self.assertEqual(final["total"], "30,36", final)
            self.assertEqual(final["priceToPay"], "30,36", final)
            self.assertEqual(
                set(final["driver"]),
                {"displayName", "carModel", "carLicensePlate"},
                final,
            )

    async def test_terminal_race_control_and_cancel_modes(self):
        await self.reset("accept")
        async with self.session.ws_connect(f"ws://127.0.0.1:{self.port}/", headers=AUTH) as ws:
            status, _ = await self.post("/races/create", {})
            self.assertEqual(status, 202)
            self.assertEqual(await self.receive_statuses(ws, 2), [100, 111])

        status, body = await self.post("/_control/race", {"statusId": 114})
        self.assertEqual(status, 200, body)
        self.assertEqual(body["race"]["statusId"], 114, body)
        status, body = await self.get("/aboutme/aboutMePassenger")
        self.assertEqual(status, 200, body)
        self.assertEqual(body["payload"]["currentRace"]["statusId"], 114, body)

        status, body = await self.post("/_control/cancel_mode", {"mode": "no_cancelable"})
        self.assertEqual(status, 200, body)
        status, body = await self.post("/races/cancel", {})
        self.assertEqual(status, 400, body)
        self.assertIn("Nenhuma corrida", body["message"], body)

    async def test_create_without_race_id_and_immediate_accept(self):
        await self.reset("accept")
        status, body = await self.post("/_control/create_mode", {"mode": "no_race_id"})
        self.assertEqual(status, 200, body)
        status, race = await self.post("/races/create", {})
        self.assertEqual(status, 202, race)
        self.assertNotIn("raceId", race, race)
        status, body = await self.get("/aboutme/aboutMePassenger")
        self.assertEqual(status, 200, body)
        self.assertTrue(body["payload"]["currentRace"]["raceId"], body)

        await self.reset("accept")
        status, body = await self.post("/_control/create_mode", {"mode": "immediate_111"})
        self.assertEqual(status, 200, body)
        status, race = await self.post("/races/create", {})
        self.assertEqual(status, 202, race)
        self.assertEqual(race["statusId"], 111, race)
        self.assertEqual(race["driver"]["displayName"], "Motorista Fake", race)

    async def test_rating_and_not_rating(self):
        await self.reset("accept")
        status, race = await self.post("/races/create", {})
        self.assertEqual(status, 202, race)
        status, body = await self.post(
            "/races/rating",
            {"ratingSelected": 4, "comment": "Bom motorista"},
        )
        self.assertEqual(status, 200, body)
        status, state = await self.get("/_control/state")
        self.assertEqual(status, 200, state)
        self.assertEqual(state["ratings"]["fake-race-1"]["ratingSelected"], 4, state)
        self.assertEqual(state["ratings"]["fake-race-1"]["comment"], "Bom motorista", state)

        status, race = await self.post("/races/create", {})
        self.assertEqual(status, 202, race)
        status, body = await self.post("/races/notRating", {})
        self.assertEqual(status, 200, body)
        status, state = await self.get("/_control/state")
        self.assertTrue(state["ratings"]["fake-race-1"]["skipped"], state)

    async def test_update_rating_and_comment(self):
        await self.reset("accept")
        status, race = await self.post("/races/create", {})
        self.assertEqual(status, 202, race)
        status, body = await self.post(
            "/races/updateRating",
            {"raceId": "fake-race-1", "ratingSelected": 5},
        )
        self.assertEqual(status, 200, body)
        status, body = await self.post(
            "/races/updateComment",
            {"raceId": "fake-race-1", "comment": "Excelente"},
        )
        self.assertEqual(status, 200, body)
        status, state = await self.get("/_control/state")
        self.assertEqual(state["ratings"]["fake-race-1"]["ratingSelected"], 5, state)
        self.assertEqual(state["ratings"]["fake-race-1"]["comment"], "Excelente", state)

    async def test_payment_refused(self):
        await self.reset("create_payment_refused")
        status, body = await self.post("/races/create", {})
        self.assertEqual(status, 402, body)

    async def test_control_websocket_injection(self):
        await self.reset("no_driver")
        async with self.session.ws_connect(f"ws://127.0.0.1:{self.port}/", headers=AUTH) as ws:
            status, _ = await self.post("/races/create", {})
            self.assertEqual(status, 202)
            self.assertEqual(await self.receive_statuses(ws, 1), [100])
            status, body = await self.post("/_control/ws", {
                "statusId": 90,
                "payload": {"refuseReason": "manual"},
            })
            self.assertEqual(status, 200, body)
            self.assertEqual(await self.receive_statuses(ws, 1), [90])


if __name__ == "__main__":
    unittest.main()

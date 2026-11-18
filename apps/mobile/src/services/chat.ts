import { Platform } from 'react-native';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  connectDatabaseEmulator,
  getDatabase,
  off,
  onValue,
  push,
  ref,
  set,
  type Database,
} from 'firebase/database';
import { API_BASE_URL, getApiToken } from '../api/client';
import type { RideDriver } from '../state/RideContext';

export type ChatMessage = {
  id: string;
  text: string;
  createdAt: number;
  mine: boolean;
};

const DB_HOST = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
const DB_URL = `http://${DB_HOST}:9000?ns=taxi-rio`;
const CHAT_NAMESPACE = 'release';

let database: Database | null = null;

function db() {
  if (!database) {
    const app = getApps().length ? getApp() : initializeApp({ databaseURL: DB_URL });
    database = getDatabase(app);
    connectDatabaseEmulator(database, DB_HOST, 9000);
  }
  return database;
}

function chatPath(raceId: string, box: 'Passenger' | 'Driver') {
  return `race-chat/${CHAT_NAMESPACE}/${raceId}/${box}`;
}

function normalizeMessages(
  value: unknown,
  mine: boolean,
): ChatMessage[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>)
    .map(([id, raw]) => {
      if (!raw || typeof raw !== 'object') return null;
      const item = raw as { messageText?: unknown; time?: unknown };
      if (typeof item.messageText !== 'string') return null;
      return {
        id,
        text: item.messageText,
        createdAt: Number(item.time) || 0,
        mine,
      } satisfies ChatMessage;
    })
    .filter((item): item is ChatMessage => Boolean(item));
}

export function subscribeToChat(
  raceId: string,
  onChange: (messages: ChatMessage[]) => void,
) {
  const passengerRef = ref(db(), chatPath(raceId, 'Passenger'));
  const driverRef = ref(db(), chatPath(raceId, 'Driver'));
  let passenger: ChatMessage[] = [];
  let driver: ChatMessage[] = [];

  const emit = () => {
    const byId = new Map<string, ChatMessage>();
    for (const message of [...passenger, ...driver]) {
      byId.set(message.id, message);
    }
    onChange(
      Array.from(byId.values()).sort((a, b) => a.createdAt - b.createdAt),
    );
  };

  const unsubscribePassenger = onValue(passengerRef, (snapshot) => {
    passenger = normalizeMessages(snapshot.val(), false);
    emit();
  });
  const unsubscribeDriver = onValue(driverRef, (snapshot) => {
    driver = normalizeMessages(snapshot.val(), true);
    emit();
  });

  return () => {
    off(passengerRef);
    off(driverRef);
    unsubscribePassenger();
    unsubscribeDriver();
  };
}

export async function sendChatMessage(
  raceId: string,
  driver: RideDriver | null,
  text: string,
) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const token = getApiToken();
  if (!token) return;

  const messagesRef = ref(db(), chatPath(raceId, 'Driver'));
  const messageRef = push(messagesRef);
  const messageCode = messageRef.key ?? `${Date.now()}`;
  await set(messageRef, {
    messageCode,
    messageText: trimmed,
    read: false,
    time: Date.now(),
  });

  try {
    await fetch(`${API_BASE_URL}/races/sendMessageToDriver`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        raceId,
        driverId: driver?.taxiDriverId ?? driver?.driverId ?? null,
        message: trimmed,
      }),
    });
  } catch {
    return;
  }
}

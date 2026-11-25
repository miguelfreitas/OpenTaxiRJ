import type { RaceHistoryItem, RacePoint } from '../api/client';
import { formatBRL, formatDistance, formatDuration } from './geo';
import { parseBRL } from './money';

export type RaceStatusTone = 'success' | 'warning' | 'danger' | 'neutral';

export type RaceStatus = {
  label: string;
  tone: RaceStatusTone;
};

function pointLabel(point?: RacePoint | null) {
  return point?.formattedAddress?.trim() ?? '';
}

export function raceOrigin(item: RaceHistoryItem) {
  return pointLabel(item.geolocationData?.origin) || pointLabel(item.origin);
}

export function raceDestination(item: RaceHistoryItem) {
  return pointLabel(item.geolocationData?.destination) || pointLabel(item.destination);
}

export function formatRaceDate(value?: string) {
  if (!value) return 'Data indisponível';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function raceStatus(item: RaceHistoryItem): RaceStatus {
  if (item.invalid) return { label: 'Inválida', tone: 'danger' };
  if (item.refound) return { label: 'Estornada', tone: 'danger' };
  if (item.rectified) return { label: 'Retificada', tone: 'warning' };
  if (item.suspect || item.raceInAnalysis) return { label: 'Em análise', tone: 'warning' };

  switch (Number(item.statusId)) {
    case 103:
      return { label: 'Cancelada', tone: 'danger' };
    case 100:
    case 110:
    case 111:
    case 112:
      return { label: 'Em andamento', tone: 'neutral' };
    case 113:
    case 114:
      return { label: 'Concluída', tone: 'success' };
    default:
      return { label: 'Concluída', tone: 'success' };
  }
}

export function raceAmount(item: RaceHistoryItem) {
  return parseBRL(item.priceToPay ?? item.total ?? item.estimatedPrice);
}

export function formatRaceAmount(item: RaceHistoryItem) {
  const amount = raceAmount(item);
  return amount === null ? null : formatBRL(amount);
}

export function raceDistance(item: RaceHistoryItem) {
  const meters = Number(item.distance?.value);
  if (Number.isFinite(meters) && meters > 0) return formatDistance(meters);
  return item.distance?.text?.trim() || null;
}

export function raceDuration(item: RaceHistoryItem) {
  const seconds = Number(item.time?.value);
  if (Number.isFinite(seconds) && seconds > 0) return formatDuration(seconds);
  return item.time?.text?.trim() || null;
}

export function racePayment(item: RaceHistoryItem) {
  return (
    item.paymentMethod?.name?.trim() ||
    item.associatedPaymentMethod?.name?.trim() ||
    null
  );
}

export function raceDriverName(item: RaceHistoryItem) {
  return item.driver?.displayName?.trim() || item.driver?.name?.trim() || null;
}

export function raceDriverVehicle(item: RaceHistoryItem) {
  return [item.driver?.carModel?.trim(), item.driver?.carLicensePlate?.trim() || item.driver?.carPlate?.trim()]
    .filter(Boolean)
    .join(' · ');
}

export function raceDiscount(item: RaceHistoryItem) {
  return parseBRL(item.discount ?? item.discountValue);
}

export function raceDiscountLabel(item: RaceHistoryItem) {
  return item.raceDiscount?.fare?.trim() || null;
}

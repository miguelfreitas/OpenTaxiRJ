import type { RideDriver } from '../state/RideContext';

export function driverName(driver: RideDriver | null | undefined) {
  return driver?.displayName?.trim() || driver?.name?.trim() || 'Motorista';
}

export function driverPlate(driver: RideDriver | null | undefined) {
  return driver?.carLicensePlate?.trim() || driver?.carPlate?.trim() || '';
}

export function driverVehicle(driver: RideDriver | null | undefined) {
  return [driver?.carModel?.trim(), driverPlate(driver)].filter(Boolean).join(' · ');
}

export function driverInitial(driver: RideDriver | null | undefined) {
  return driverName(driver).charAt(0).toUpperCase();
}

export const DEFAULT_TURKEY_LOCATION = {
  latitude: 38.4237,
  longitude: 27.1428,
} as const;

export function isValidCoordinate(latitude: number, longitude: number) {
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180
    && !(latitude === 0 && longitude === 0);
}

export function isInTurkey(latitude: number, longitude: number) {
  return isValidCoordinate(latitude, longitude)
    && latitude >= 35
    && latitude <= 43
    && longitude >= 25
    && longitude <= 46;
}

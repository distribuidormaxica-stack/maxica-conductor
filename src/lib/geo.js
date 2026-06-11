// Utilidades geográficas puras (sin dependencias nativas).

const RADIO_TIERRA_M = 6371000

// Distancia haversine entre dos coordenadas (grados decimales), en metros.
export function distanciaMetros(lat1, lng1, lat2, lng2) {
  const rad = (g) => (g * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * RADIO_TIERRA_M * Math.asin(Math.sqrt(a))
}

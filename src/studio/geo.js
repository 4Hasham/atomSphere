// Studio world frame: 1 unit = 1 meter, origin at the site, +x east, +y up, +z south.
// Positions are derived from Web Mercator so they line up exactly with Mapbox tiles.
// The scale is taken at the site latitude, which is accurate to well under 1% across
// the tens of kilometers a Studio scene covers.

export const EARTH_CIRCUMFERENCE_METERS = 40075016.68557849;
export const MAX_MERCATOR_LATITUDE = 85.051129;

const DEGREES = 180 / Math.PI;

// Position on the Web Mercator square, 0..1 on both axes (x east, y south).
export function latLonToMercator(latitude, longitude) {
  const latitudeRadians = latitude / DEGREES;
  return {
    x: (longitude + 180) / 360,
    y: (1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2,
  };
}

export function mercatorToLatLon(x, y) {
  return {
    latitude: Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * DEGREES,
    longitude: x * 360 - 180,
  };
}

// Meters covered by the full width of the Mercator square at this latitude.
export function mercatorMetersAt(latitude) {
  return EARTH_CIRCUMFERENCE_METERS * Math.cos(latitude / DEGREES);
}

export function isValidSite(site) {
  return Boolean(site)
    && Number.isFinite(site.latitude)
    && Math.abs(site.latitude) <= MAX_MERCATOR_LATITUDE
    && Number.isFinite(site.longitude)
    && Math.abs(site.longitude) <= 180;
}

export function latLonToLocal(site, latitude, longitude) {
  const origin = latLonToMercator(site.latitude, site.longitude);
  const point = latLonToMercator(latitude, longitude);
  const meters = mercatorMetersAt(site.latitude);
  let dx = point.x - origin.x;
  dx -= Math.round(dx); // take the short way across the antimeridian

  return { x: dx * meters, z: (point.y - origin.y) * meters };
}

export function localToLatLon(site, x, z) {
  const origin = latLonToMercator(site.latitude, site.longitude);
  const meters = mercatorMetersAt(site.latitude);
  const { latitude, longitude } = mercatorToLatLon(origin.x + x / meters, origin.y + z / meters);

  return { latitude, longitude: ((longitude + 540) % 360) - 180 };
}

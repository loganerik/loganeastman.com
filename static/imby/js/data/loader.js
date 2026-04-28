/**
 * IMBY - Data Loader
 * Loads real LA zipcode boundaries and zoning data
 */

import { store } from '../state/store.js';

let zipcodeGeoJSON = null;
let zipcodeData = null;

export async function loadZipcodeData() {
  if (zipcodeGeoJSON && zipcodeData) {
    return { geojson: zipcodeGeoJSON, data: zipcodeData };
  }

  store.setState({ isLoading: true });

  try {
    const [geoResponse, dataResponse] = await Promise.all([
      fetch('data/la-zipcodes.geojson'),
      fetch('data/zipcode-data.json')
    ]);

    if (!geoResponse.ok || !dataResponse.ok) {
      throw new Error('Failed to load zipcode data');
    }

    zipcodeGeoJSON = await geoResponse.json();
    zipcodeData = await dataResponse.json();

    console.log(`Loaded ${zipcodeGeoJSON.features.length} zipcode boundaries`);
    console.log(`Loaded data for ${Object.keys(zipcodeData).length} zipcodes`);

    store.setState({ isLoading: false });
    return { geojson: zipcodeGeoJSON, data: zipcodeData };
  } catch (error) {
    console.error('Error loading zipcode data:', error);
    store.setState({ isLoading: false });
    throw error;
  }
}

export function getZipcodeData(zipcode) {
  if (!zipcodeData) return null;
  return zipcodeData[zipcode] || null;
}

export function getCitywideData() {
  if (!zipcodeData) return null;
  return zipcodeData._citywide || null;
}

export function getAllZipcodeData() {
  return zipcodeData;
}

export function getZipcodeFeature(zipcode) {
  if (!zipcodeGeoJSON) return null;
  return zipcodeGeoJSON.features.find(f =>
    f.properties.zipcode === zipcode || f.properties.ZCTA5CE10 === zipcode
  );
}

export async function searchZipcode(zipcode) {
  const cleanZip = zipcode.trim();
  if (!/^\d{5}$/.test(cleanZip)) {
    throw new Error('Invalid zipcode format');
  }

  await loadZipcodeData();

  const feature = getZipcodeFeature(cleanZip);
  const data = getZipcodeData(cleanZip);

  if (feature) {
    const coords = feature.geometry.coordinates;
    let lat, lng;

    if (feature.properties.INTPTLAT10 && feature.properties.INTPTLON10) {
      lat = parseFloat(feature.properties.INTPTLAT10);
      lng = parseFloat(feature.properties.INTPTLON10);
    } else {
      const centroid = calculateCentroid(coords);
      lat = centroid[1];
      lng = centroid[0];
    }

    return {
      lat,
      lng,
      zipcode: cleanZip,
      name: data?.name || 'LA Area',
      data
    };
  }

  const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
  const params = new URLSearchParams({
    q: `${cleanZip}, Los Angeles, CA`,
    format: 'json',
    limit: 1
  });

  const response = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { 'User-Agent': 'IMBY-App/1.0' }
  });

  if (!response.ok) {
    throw new Error('Geocoding request failed');
  }

  const results = await response.json();
  if (results.length === 0) {
    throw new Error('Zipcode not found');
  }

  return {
    lat: parseFloat(results[0].lat),
    lng: parseFloat(results[0].lon),
    zipcode: cleanZip,
    name: 'LA Area',
    data: null
  };
}

function calculateCentroid(coordinates) {
  let totalLat = 0;
  let totalLng = 0;
  let count = 0;

  function processCoords(coords) {
    if (typeof coords[0] === 'number') {
      totalLng += coords[0];
      totalLat += coords[1];
      count++;
    } else {
      coords.forEach(processCoords);
    }
  }

  processCoords(coordinates);
  return [totalLng / count, totalLat / count];
}

/**
 * IMBY - Map Initialization
 * Leaflet setup with zipcode-level visualization
 */

import { store } from '../state/store.js';

let map = null;
let zipcodeLayer = null;
let selectedZipcodeLayer = null;

const CARTO_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const CARTO_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

export function initMap() {
  const { center, zoom } = store.getState();

  map = L.map('map', {
    center,
    zoom,
    minZoom: 8,
    maxZoom: 16,
    maxBounds: [
      [33.0, -119.5],
      [35.0, -117.0]
    ],
    preferCanvas: true,
    zoomControl: true
  });

  L.tileLayer(CARTO_DARK, {
    attribution: CARTO_ATTRIBUTION,
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);

  map.zoomControl.setPosition('topright');

  map.on('moveend', () => {
    const newCenter = map.getCenter();
    const newZoom = map.getZoom();
    store.setState({
      center: [newCenter.lat, newCenter.lng],
      zoom: newZoom
    });
  });

  return map;
}

export function getMap() {
  return map;
}

export function flyTo(lat, lng, zoom = 12) {
  if (map) {
    map.flyTo([lat, lng], zoom, {
      duration: 1.5,
      easeLinearity: 0.25
    });
  }
}

export function setZipcodeLayer(geojson) {
  if (zipcodeLayer) {
    map.removeLayer(zipcodeLayer);
  }

  zipcodeLayer = L.geoJSON(geojson, {
    style: styleZipcode,
    onEachFeature: onEachZipcode
  }).addTo(map);

  return zipcodeLayer;
}

function styleZipcode(feature) {
  const props = feature.properties;
  const { reforms, selectedZipcode, year } = store.getState();
  const zipcode = props.zipcode || props.ZCTA5CE10;

  const r1Pct = props.r1Pct || 0.5;
  const isHillside = props.isHillside || false;
  const isSelected = zipcode === selectedZipcode;

  let fillColor;
  let fillOpacity = 0.5;

  // Check how many reforms are active
  const activeReforms = Object.values(reforms).filter(v => v).length;

  // Historical view (timeline before modern restrictions)
  if (year < 1956) {
    // Pre-downzoning: show everything as more developable
    const potentialMultiplier = year < 1921 ? 0.9 : year < 1946 ? 0.7 : 0.5;
    fillColor = `rgba(0, 184, 148, ${potentialMultiplier * r1Pct + 0.2})`;
    fillOpacity = 0.6;
  } else if (activeReforms > 0) {
    // Reform view: green for areas that would benefit
    const benefitScore =
      (reforms.removeR1 ? r1Pct * 0.6 : 0) +
      (reforms.noHillsideOrdinance && isHillside ? 0.3 : 0) +
      (reforms.noHeightLimits ? props.r2r4Pct * 0.2 : 0) +
      (reforms.noParkingMinimums ? 0.1 : 0);

    if (benefitScore > 0.5) {
      fillColor = 'rgba(0, 184, 148, 0.7)';
    } else if (benefitScore > 0.3) {
      fillColor = 'rgba(0, 184, 148, 0.5)';
    } else if (benefitScore > 0.1) {
      fillColor = 'rgba(0, 184, 148, 0.3)';
    } else {
      fillColor = 'rgba(108, 92, 231, 0.3)';
    }
    fillOpacity = 0.6;
  } else {
    // Current restriction view: red = more R1
    if (r1Pct > 0.7) {
      fillColor = 'rgba(214, 48, 49, 0.6)';
    } else if (r1Pct > 0.5) {
      fillColor = 'rgba(214, 48, 49, 0.4)';
    } else if (r1Pct > 0.3) {
      fillColor = 'rgba(253, 121, 168, 0.4)';
    } else if (props.commercialPct > 0.3) {
      fillColor = 'rgba(108, 92, 231, 0.4)';
    } else if (props.industrialPct > 0.2) {
      fillColor = 'rgba(99, 110, 114, 0.4)';
    } else {
      fillColor = 'rgba(253, 121, 168, 0.3)';
    }
  }

  return {
    fillColor,
    fillOpacity: isSelected ? 0.85 : fillOpacity,
    color: isSelected ? '#f5a623' : 'rgba(255, 255, 255, 0.25)',
    weight: isSelected ? 3 : 1,
    opacity: 0.8
  };
}

function onEachZipcode(feature, layer) {
  const props = feature.properties;
  const zipcode = props.zipcode || props.ZCTA5CE10;
  const name = props.name || 'LA Area';
  const r1Pct = props.r1Pct ? (props.r1Pct * 100).toFixed(0) : '—';
  const totalAcres = props.totalAcres ? props.totalAcres.toLocaleString() : '—';

  layer.bindTooltip(`
    <strong>${zipcode}</strong> - ${name}<br>
    <span style="font-size: 11px;">
      R1: ${r1Pct}% | ${totalAcres} acres
      ${props.isHillside ? ' | Hillside' : ''}
    </span>
  `, {
    className: 'parcel-tooltip',
    direction: 'top',
    offset: [0, -10]
  });

  layer.on('click', () => {
    store.setState({
      selectedZipcode: zipcode,
      activeTab: 'details'
    });
    refreshZipcodeStyle();
  });

  layer.on('mouseover', function() {
    if (store.getState().selectedZipcode !== zipcode) {
      this.setStyle({
        weight: 2,
        color: '#f5a623',
        fillOpacity: 0.7
      });
    }
  });

  layer.on('mouseout', function() {
    if (store.getState().selectedZipcode !== zipcode) {
      zipcodeLayer.resetStyle(this);
    }
  });
}

export function refreshZipcodeStyle() {
  if (zipcodeLayer) {
    zipcodeLayer.setStyle(styleZipcode);
  }
}

export function highlightZipcode(zipcode) {
  if (!zipcodeLayer) return;

  zipcodeLayer.eachLayer(layer => {
    const layerZip = layer.feature.properties.zipcode || layer.feature.properties.ZCTA5CE10;
    if (layerZip === zipcode) {
      layer.setStyle({
        weight: 3,
        color: '#f5a623',
        fillOpacity: 0.8
      });
      layer.bringToFront();
    }
  });
}

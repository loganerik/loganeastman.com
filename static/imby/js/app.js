/**
 * IMBY - In My Back Yard
 * Main Application Entry Point
 */

import { store } from './state/store.js';
import { initMap, flyTo, setZipcodeLayer, refreshZipcodeStyle, highlightZipcode } from './map/mapInit.js';
import { loadZipcodeData, searchZipcode, getZipcodeData, getCitywideData } from './data/loader.js';
import { presetScenarios, regulations } from './data/regulations.js';
import { getZipcodeNarrative, getRegulationsForYear, REGULATORY_TIMELINE, getHistoricalPotential } from './data/zipcode-narratives.js';
import {
  calculateCitywideImpact,
  getZipcodeAnalysis,
  formatGDP,
  formatUnits
} from './analysis/counterfactual.js';

let timelineInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
  initMap();

  setupSearch();
  setupTabs();
  setupToggles();
  setupPresets();
  setupTimeline();
  setupMobilePanel();

  // State subscriptions
  store.subscribe('reforms', () => {
    refreshZipcodeStyle();
    updateImpactDisplay();
  });

  store.subscribe('selectedZipcode', () => {
    updateDetailPanel();
    const { selectedZipcode } = store.getState();
    if (selectedZipcode) {
      highlightZipcode(selectedZipcode);
    }
  });

  store.subscribe('year', (year) => {
    document.getElementById('timeline-year').textContent = year;
    updateTimelineDisplay(year);
    refreshZipcodeStyle();
  });

  store.subscribe('activeTab', updateActiveTab);

  // Load data
  try {
    showLoading(true);
    const { geojson } = await loadZipcodeData();
    setZipcodeLayer(geojson);
    updateImpactDisplay();
    updateDetailPanel(); // Show citywide overview initially
    showLoading(false);
  } catch (error) {
    console.error('Failed to load data:', error);
    showLoading(false);
  }
});

function showLoading(show) {
  const container = document.getElementById('map-container');
  let loader = container.querySelector('.map-loading');
  if (show && !loader) {
    loader = document.createElement('div');
    loader.className = 'map-loading';
    loader.innerHTML = `
      <div class="map-loading-spinner"></div>
      <div class="map-loading-text">Loading LA Data...</div>
    `;
    container.appendChild(loader);
  } else if (!show && loader) {
    loader.remove();
  }
}

// === SEARCH ===
function setupSearch() {
  const input = document.getElementById('zipcode-search');
  const btn = document.getElementById('search-btn');

  const doSearch = async () => {
    const zip = input.value.trim().match(/^\d{5}/)?.[0];
    if (!zip) return;

    btn.disabled = true;
    try {
      const result = await searchZipcode(zip);
      flyTo(result.lat, result.lng, 13);
      store.setState({ selectedZipcode: zip, activeTab: 'details' });
      if (result.name) input.value = `${zip} - ${result.name}`;
    } catch (e) {
      input.value = '';
      input.placeholder = 'Zipcode not found';
      setTimeout(() => { input.placeholder = 'Enter LA zipcode...'; }, 2000);
    }
    btn.disabled = false;
  };

  btn.addEventListener('click', doSearch);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  input.addEventListener('focus', () => {
    const match = input.value.match(/^\d{5}/);
    if (match) input.value = match[0];
  });
}

// === TABS ===
function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      store.setState({ activeTab: tab.dataset.tab });
    });
  });
}

function updateActiveTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabId}`));
}

// === TOGGLES ===
function setupToggles() {
  document.querySelectorAll('[data-reform]').forEach(input => {
    input.addEventListener('change', () => {
      const { reforms } = store.getState();
      store.setState({ reforms: { ...reforms, [input.dataset.reform]: input.checked } });
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    });
  });
}

// === PRESETS ===
function setupPresets() {
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = presetScenarios[btn.dataset.preset];
      if (!preset) return;

      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('[data-reform]').forEach(input => {
        input.checked = preset.reforms[input.dataset.reform] || false;
      });

      store.setState({ reforms: preset.reforms, year: preset.year });
      document.getElementById('timeline-slider').value = preset.year;
    });
  });
}

// === TIMELINE ===
function setupTimeline() {
  const slider = document.getElementById('timeline-slider');
  const playBtn = document.getElementById('timeline-play');

  slider.addEventListener('input', () => {
    store.setState({ year: parseInt(slider.value) });
  });

  playBtn.addEventListener('click', () => {
    if (timelineInterval) {
      clearInterval(timelineInterval);
      timelineInterval = null;
      playBtn.classList.remove('playing');
      playBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"></polygon></svg>`;
    } else {
      // Start from 1900 if at end
      let { year } = store.getState();
      if (year >= 2026) {
        year = 1900;
        store.setState({ year });
        slider.value = year;
      }

      playBtn.classList.add('playing');
      playBtn.innerHTML = `<span style="font-size:14px;">❚❚</span>`;

      timelineInterval = setInterval(() => {
        const { year } = store.getState();
        if (year >= 2026) {
          clearInterval(timelineInterval);
          timelineInterval = null;
          playBtn.classList.remove('playing');
          playBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"></polygon></svg>`;
          return;
        }
        const newYear = year + 1;
        store.setState({ year: newYear });
        slider.value = newYear;
      }, 80);
    }
  });

  document.querySelectorAll('.timeline-markers span').forEach(marker => {
    marker.addEventListener('click', () => {
      const year = parseInt(marker.dataset.year);
      store.setState({ year });
      slider.value = year;
    });
  });

  // Initial timeline display
  updateTimelineDisplay(store.getState().year);
}

function updateTimelineDisplay(year) {
  // Update the regulation display in overview
  const activeRegs = getRegulationsForYear(year);
  const regList = document.getElementById('active-regulations');
  if (regList) {
    if (activeRegs.length === 0) {
      regList.innerHTML = '<div class="reg-item"><span class="reg-year">Pre-1905</span><span class="reg-name">Minimal regulation—build almost anything</span></div>';
    } else {
      regList.innerHTML = activeRegs.slice(-5).map(r => `
        <div class="reg-item">
          <span class="reg-year">${r.year}</span>
          <span class="reg-name">${r.name}</span>
        </div>
      `).join('');
    }
  }

  // Update the "development potential" indicator
  const potentialEl = document.getElementById('development-potential');
  if (potentialEl) {
    const multiplier = getHistoricalPotential(year, {});
    const pct = Math.round((multiplier - 1) * 100);
    if (pct > 0) {
      potentialEl.textContent = `+${pct}% more development was possible`;
      potentialEl.style.color = 'var(--neon-teal)';
    } else {
      potentialEl.textContent = 'Current regulatory environment';
      potentialEl.style.color = 'var(--text-muted)';
    }
  }
}

// === MOBILE PANEL ===
function setupMobilePanel() {
  const panel = document.getElementById('side-panel');
  const handle = panel.querySelector('.panel-drag-handle');
  if (!handle) return;

  let startY = 0;
  handle.addEventListener('touchstart', e => { startY = e.touches[0].clientY; });
  handle.addEventListener('touchmove', e => {
    const diff = startY - e.touches[0].clientY;
    if (diff > 50) panel.classList.add('expanded');
    else if (diff < -50) panel.classList.remove('expanded');
  });
  handle.addEventListener('click', () => panel.classList.toggle('expanded'));
}

// === IMPACT DISPLAY ===
function updateImpactDisplay() {
  const { reforms, selectedZipcode } = store.getState();

  if (selectedZipcode) {
    // Zipcode-specific impact
    const analysis = getZipcodeAnalysis(selectedZipcode);
    if (analysis) {
      document.getElementById('units-lost').textContent = formatUnits(analysis.additionalUnits);
      document.getElementById('gdp-impact').textContent = formatGDP(analysis.gdpImpact);
    }
  } else {
    // Citywide impact
    const impact = calculateCitywideImpact(reforms);
    document.getElementById('units-lost').textContent = formatUnits(impact.unitsLost);
    document.getElementById('gdp-impact').textContent = formatGDP(impact.gdpImpact);
  }
}

// === DETAIL PANEL ===
function updateDetailPanel() {
  const { selectedZipcode, reforms, year } = store.getState();

  const placeholder = document.querySelector('.parcel-placeholder');
  const details = document.getElementById('parcel-details');

  if (!selectedZipcode) {
    // Show citywide overview
    placeholder.hidden = true;
    details.hidden = false;
    showCitywideOverview();
    return;
  }

  const data = getZipcodeData(selectedZipcode);
  if (!data) {
    placeholder.innerHTML = '<p>No data for this zipcode</p>';
    placeholder.hidden = false;
    details.hidden = true;
    return;
  }

  placeholder.hidden = true;
  details.hidden = false;

  const narrative = getZipcodeNarrative(selectedZipcode, data);
  const analysis = getZipcodeAnalysis(selectedZipcode);
  const historicalMultiplier = getHistoricalPotential(year, data);

  // Header
  document.getElementById('parcel-address').textContent = narrative.name;
  document.getElementById('parcel-apn').textContent = selectedZipcode;
  document.getElementById('parcel-zone').textContent =
    `${data.totalAcres.toLocaleString()} acres | ${(data.r1Pct * 100).toFixed(0)}% R1${data.isHillside ? ' | Hillside' : ''}`;

  // Build the detail content
  const harmList = document.getElementById('harm-list');
  harmList.innerHTML = `
    <div class="narrative-section">
      <h4 class="narrative-era">Peak Development: ${narrative.era}</h4>
      <div class="narrative-story">${narrative.story.split('\n\n').map(p => `<p>${p}</p>`).join('')}</div>
    </div>

    <div class="narrative-section">
      <h4>Key Regulations Affecting This Area</h4>
      <ul class="key-regulations">
        ${narrative.keyRegulations.map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>

    <div class="narrative-section">
      <h4>What Was Lost</h4>
      <p class="what-lost">${narrative.whatWasLost}</p>
    </div>

    <div class="narrative-section">
      <h4>If Reformed</h4>
      <p class="if-reformed">${narrative.ifReformed}</p>
    </div>

    <div class="narrative-section">
      <h4>Current Constraints</h4>
      ${analysis ? analysis.constraints.map(c => `
        <div class="harm-item ${c.binding ? '' : 'reform-enabled'}">
          <span class="harm-indicator ${c.harmClass}"></span>
          <div class="harm-content">
            <span class="harm-name">${c.regulation}</span>
            <span class="harm-impact">${c.impact}</span>
            ${!c.binding ? '<span class="harm-reformed">REFORMED</span>' : ''}
          </div>
        </div>
      `).join('') : ''}
    </div>
  `;

  // Counterfactual numbers
  if (analysis) {
    document.getElementById('cf-current').textContent = `~${formatUnits(analysis.currentUnits)} units`;
    document.getElementById('cf-potential').textContent = `+${formatUnits(analysis.additionalUnits)} potential`;
  }
}

function showCitywideOverview() {
  const citywide = getCitywideData();
  const { reforms, year } = store.getState();
  const impact = calculateCitywideImpact(reforms);
  const activeRegs = getRegulationsForYear(year);

  document.getElementById('parcel-address').textContent = 'Los Angeles';
  document.getElementById('parcel-apn').textContent = 'Citywide Overview';
  document.getElementById('parcel-zone').textContent = citywide ?
    `${citywide.totalAcres?.toLocaleString() || '302,000'} acres | ~60% R1` : '302,000 acres';

  const harmList = document.getElementById('harm-list');
  harmList.innerHTML = `
    <div class="narrative-section">
      <h4>LA's Regulatory History</h4>
      <p>Los Angeles was once a city that built freely. From 1900-1940, neighborhoods like Hollywood, Venice, and Koreatown developed with dense, walkable, mixed-use buildings—the same character now protected as "historic."</p>
      <p>Then came the restrictions: comprehensive zoning (1921), parking minimums (1950), downzoning (1956), CEQA (1970), and the Hillside Ordinance (2011). Each layer made it harder to build what already exists.</p>
    </div>

    <div class="narrative-section">
      <h4 id="timeline-regulations-header">Regulations Active in ${year}</h4>
      <div id="active-regulations" class="active-regulations">
        ${activeRegs.length === 0 ?
          '<div class="reg-item"><span class="reg-year">Pre-1905</span><span class="reg-name">Minimal regulation</span></div>' :
          activeRegs.slice(-6).map(r => `
            <div class="reg-item">
              <span class="reg-year">${r.year}</span>
              <span class="reg-name">${r.name}</span>
            </div>
          `).join('')
        }
      </div>
      <p id="development-potential" class="development-potential"></p>
    </div>

    <div class="narrative-section">
      <h4>The Cost</h4>
      <p>LA's housing shortage isn't natural—it's policy. The neighborhoods we admire most would be <strong>illegal to build today</strong>.</p>
      <p>Per the Hsieh-Moretti study, housing constraints in cities like LA have reduced US GDP by ~36%. LA's share: hundreds of billions in lost productivity, hundreds of thousands of workers who couldn't move here.</p>
    </div>

    <div class="narrative-section">
      <h4>What Reform Could Unlock</h4>
      <div class="citywide-stats">
        <div class="stat-row">
          <span>R1 (single-family) land:</span>
          <span>${citywide?.r1Acres?.toLocaleString() || '181,000'} acres</span>
        </div>
        <div class="stat-row">
          <span>If R1 reform passes:</span>
          <span class="highlight">+${formatUnits(impact.breakdown?.removeR1?.units || 630000)} units possible</span>
        </div>
        <div class="stat-row">
          <span>Annual GDP gain:</span>
          <span class="highlight">${formatGDP(impact.gdpImpact)}</span>
        </div>
      </div>
    </div>

    <div class="narrative-section">
      <h4>Explore</h4>
      <p>Click any zipcode on the map to see how regulation shaped that specific neighborhood. Try:</p>
      <ul class="explore-suggestions">
        <li><strong>90068</strong> - Hollywood Hills (hillside restrictions)</li>
        <li><strong>90020</strong> - Koreatown (dense because built early)</li>
        <li><strong>90291</strong> - Venice (was dense, then downzoned)</li>
        <li><strong>90027</strong> - Los Feliz (streetcar suburb frozen)</li>
      </ul>
    </div>
  `;

  document.getElementById('cf-current').textContent = `~1.5M units`;
  document.getElementById('cf-potential').textContent = `+${formatUnits(impact.unitsLost)} potential`;

  // Update timeline display
  updateTimelineDisplay(year);
}

// Add styles
const style = document.createElement('style');
style.textContent = `
  .narrative-section { margin-bottom: 20px; }
  .narrative-section h4 {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--neon-amber);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--noir-smoke);
  }
  .narrative-era { color: var(--text-muted) !important; }
  .narrative-story { font-size: 14px; line-height: 1.7; }
  .narrative-story p { margin-bottom: 12px; }
  .key-regulations { list-style: none; padding: 0; }
  .key-regulations li {
    padding: 6px 0;
    border-bottom: 1px solid var(--noir-smoke);
    font-size: 13px;
  }
  .what-lost { color: var(--neon-red); font-style: italic; }
  .if-reformed { color: var(--neon-teal); }
  .harm-item { display: flex; align-items: flex-start; gap: 10px; padding: 8px; background: var(--noir-slate); border-radius: 4px; margin-bottom: 6px; }
  .harm-item.reform-enabled { opacity: 0.5; }
  .harm-indicator { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
  .harm-indicator.preference { background: var(--neon-amber); }
  .harm-indicator.mixed { background: #9b59b6; }
  .harm-indicator.true_harm { background: var(--neon-red); }
  .harm-content { flex: 1; }
  .harm-name { display: block; font-size: 13px; font-weight: 600; }
  .harm-impact { display: block; font-size: 11px; color: var(--text-muted); }
  .harm-reformed { font-family: var(--font-mono); font-size: 9px; color: var(--neon-teal); text-transform: uppercase; }
  .active-regulations { margin: 8px 0; }
  .reg-item { display: flex; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--noir-smoke); font-size: 12px; }
  .reg-year { font-family: var(--font-mono); color: var(--neon-amber); min-width: 40px; }
  .reg-name { color: var(--text-primary); }
  .development-potential { font-size: 13px; margin-top: 8px; font-style: italic; }
  .citywide-stats { background: var(--noir-slate); padding: 12px; border-radius: 4px; }
  .stat-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--noir-smoke); font-size: 13px; }
  .stat-row:last-child { border-bottom: none; }
  .stat-row .highlight { color: var(--neon-teal); font-weight: 600; }
  .explore-suggestions { list-style: none; padding: 0; }
  .explore-suggestions li { padding: 6px 0; font-size: 13px; cursor: pointer; }
  .explore-suggestions li:hover { color: var(--neon-amber); }
  .explore-suggestions strong { font-family: var(--font-mono); }
`;
document.head.appendChild(style);

// Make explore suggestions clickable
document.addEventListener('click', e => {
  if (e.target.closest('.explore-suggestions li')) {
    const text = e.target.closest('li').textContent;
    const zip = text.match(/\d{5}/)?.[0];
    if (zip) {
      document.getElementById('zipcode-search').value = zip;
      document.getElementById('search-btn').click();
    }
  }
});

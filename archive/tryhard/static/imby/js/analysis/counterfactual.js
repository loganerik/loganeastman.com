/**
 * IMBY - Counterfactual Analysis Engine
 * Calculates development impact at zipcode level using real data
 */

import { store } from '../state/store.js';
import { getAllZipcodeData, getCitywideData, getZipcodeData } from '../data/loader.js';

// Economic constants from Hsieh-Moretti (2019)
const ECONOMIC_CONSTANTS = {
  avgHouseholdSize: 2.3,
  workersPerHousehold: 1.4,
  laWagePremium: 0.20, // LA wage premium over national average
  nationalAvgWage: 65000,
  agglomerationMultiplier: 1.15, // Productivity spillover effects
  discountRate: 0.03,
};

// Development parameters by reform type
const REFORM_IMPACTS = {
  removeR1: {
    additionalUnitsPerAcre: 10, // Average additional units possible
    takeUpRate: 0.35, // Only 35% of parcels would actually redevelop
    description: 'Allows multi-family housing on single-family lots'
  },
  noHeightLimits: {
    densityMultiplier: 1.25,
    description: 'Removes height restrictions, enabling taller buildings'
  },
  noFARLimits: {
    densityMultiplier: 1.20,
    description: 'Removes floor area ratio limits'
  },
  noParkingMinimums: {
    densityMultiplier: 1.15,
    costReduction: 0.10, // 10% cost reduction per unit
    description: 'Eliminates required parking spaces'
  },
  noSetbacks: {
    densityMultiplier: 1.08,
    description: 'Removes setback requirements'
  },
  noHillsideOrdinance: {
    hillsideMultiplier: 2.0, // Doubles potential on hillside lots
    description: 'Removes slope-based FAR limits and grading restrictions'
  },
  noCEQA: {
    timeReduction: 12, // months saved
    costReduction: 0.05,
    uptakeIncrease: 1.10,
    description: 'Eliminates environmental review delays'
  }
};

/**
 * Calculate citywide impact of enabled reforms
 */
export function calculateCitywideImpact(reforms) {
  const zipcodeData = getAllZipcodeData();
  const citywide = getCitywideData();

  if (!zipcodeData) {
    return { unitsLost: null, gdpImpact: null, breakdown: {} };
  }

  let totalPotentialUnits = 0;
  const zipcodeImpacts = {};

  // Calculate impact per zipcode
  for (const [zipcode, data] of Object.entries(zipcodeData)) {
    if (zipcode === '_citywide' || !data.totalAcres) continue;

    const impact = calculateZipcodeImpact(zipcode, data, reforms);
    zipcodeImpacts[zipcode] = impact;
    totalPotentialUnits += impact.potentialUnits;
  }

  // Calculate GDP impact using Hsieh-Moretti methodology
  const gdpImpact = calculateGDPImpact(totalPotentialUnits);

  // Calculate breakdown by reform type
  const breakdown = calculateReformBreakdown(reforms, zipcodeData);

  return {
    unitsLost: Math.round(totalPotentialUnits),
    gdpImpact,
    breakdown,
    zipcodeImpacts
  };
}

/**
 * Calculate impact for a single zipcode
 */
function calculateZipcodeImpact(zipcode, data, reforms) {
  let potentialUnits = 0;
  const impacts = {};

  // R1 Reform (biggest impact)
  if (reforms.removeR1 && data.r1Pct > 0) {
    const r1Acres = data.totalAcres * data.r1Pct;
    const additionalUnits = r1Acres * REFORM_IMPACTS.removeR1.additionalUnitsPerAcre * REFORM_IMPACTS.removeR1.takeUpRate;
    potentialUnits += additionalUnits;
    impacts.removeR1 = additionalUnits;
  }

  // Height limits (applies to existing multi-family areas)
  if (reforms.noHeightLimits && data.r2r4Pct > 0) {
    const mfAcres = data.totalAcres * data.r2r4Pct;
    const currentDensity = 20; // units per acre in multi-family
    const additionalUnits = mfAcres * currentDensity * (REFORM_IMPACTS.noHeightLimits.densityMultiplier - 1) * 0.3;
    potentialUnits += additionalUnits;
    impacts.noHeightLimits = additionalUnits;
  }

  // FAR limits
  if (reforms.noFARLimits) {
    const additionalUnits = potentialUnits * (REFORM_IMPACTS.noFARLimits.densityMultiplier - 1);
    potentialUnits += additionalUnits;
    impacts.noFARLimits = additionalUnits;
  }

  // Parking minimums
  if (reforms.noParkingMinimums) {
    const additionalUnits = potentialUnits * (REFORM_IMPACTS.noParkingMinimums.densityMultiplier - 1);
    potentialUnits += additionalUnits;
    impacts.noParkingMinimums = additionalUnits;
  }

  // Setbacks
  if (reforms.noSetbacks) {
    const additionalUnits = potentialUnits * (REFORM_IMPACTS.noSetbacks.densityMultiplier - 1);
    potentialUnits += additionalUnits;
    impacts.noSetbacks = additionalUnits;
  }

  // Hillside Ordinance (only applies to hillside areas)
  if (reforms.noHillsideOrdinance && data.isHillside) {
    const hillsideBonus = potentialUnits * (REFORM_IMPACTS.noHillsideOrdinance.hillsideMultiplier - 1);
    potentialUnits += hillsideBonus;
    impacts.noHillsideOrdinance = hillsideBonus;
  }

  // CEQA (increases overall uptake)
  if (reforms.noCEQA) {
    const ceqaBonus = potentialUnits * (REFORM_IMPACTS.noCEQA.uptakeIncrease - 1);
    potentialUnits += ceqaBonus;
    impacts.noCEQA = ceqaBonus;
  }

  return {
    zipcode,
    name: data.name,
    potentialUnits: Math.round(potentialUnits),
    impacts,
    isHillside: data.isHillside,
    r1Pct: data.r1Pct,
    totalAcres: data.totalAcres
  };
}

/**
 * Calculate GDP impact using Hsieh-Moretti methodology
 * "Housing Constraints and Spatial Misallocation" (2019)
 */
export function calculateGDPImpact(additionalUnits) {
  // Workers who could move to LA with additional housing
  const additionalWorkers = additionalUnits *
    ECONOMIC_CONSTANTS.avgHouseholdSize *
    ECONOMIC_CONSTANTS.workersPerHousehold;

  // Wage gain per worker moving to LA
  const wageGainPerWorker =
    ECONOMIC_CONSTANTS.nationalAvgWage *
    ECONOMIC_CONSTANTS.laWagePremium;

  // Apply agglomeration multiplier (workers in LA are more productive)
  const annualGDPGain =
    additionalWorkers *
    wageGainPerWorker *
    ECONOMIC_CONSTANTS.agglomerationMultiplier;

  return Math.round(annualGDPGain);
}

/**
 * Calculate breakdown by reform type
 */
function calculateReformBreakdown(reforms, zipcodeData) {
  const breakdown = {};

  for (const [reformId, enabled] of Object.entries(reforms)) {
    if (!enabled) continue;

    let totalImpact = 0;

    for (const [zipcode, data] of Object.entries(zipcodeData)) {
      if (zipcode === '_citywide' || !data.totalAcres) continue;

      if (reformId === 'removeR1' && data.r1Pct > 0) {
        const r1Acres = data.totalAcres * data.r1Pct;
        totalImpact += r1Acres * REFORM_IMPACTS.removeR1.additionalUnitsPerAcre * REFORM_IMPACTS.removeR1.takeUpRate;
      }
      // Add other reforms...
    }

    breakdown[reformId] = {
      units: Math.round(totalImpact),
      gdp: calculateGDPImpact(totalImpact),
      description: REFORM_IMPACTS[reformId]?.description || ''
    };
  }

  return breakdown;
}

/**
 * Get constraints and impact for a specific zipcode
 */
export function getZipcodeAnalysis(zipcode) {
  const data = getZipcodeData(zipcode);
  const { reforms } = store.getState();

  if (!data) {
    return null;
  }

  const impact = calculateZipcodeImpact(zipcode, data, reforms);
  const gdpImpact = calculateGDPImpact(impact.potentialUnits);

  // Build constraints list
  const constraints = [];

  if (data.r1Pct > 0.5) {
    constraints.push({
      regulation: 'Single-Family Zoning (R1)',
      harmClass: 'preference',
      impact: `${(data.r1Pct * 100).toFixed(0)}% of area restricted to 1 unit/lot`,
      binding: !reforms.removeR1,
      potentialUnits: Math.round(data.totalAcres * data.r1Pct * 10 * 0.35)
    });
  }

  constraints.push({
    regulation: 'Height Limits',
    harmClass: 'mixed',
    impact: 'Limits buildings to 2-3 stories in most areas',
    binding: !reforms.noHeightLimits,
    potentialUnits: Math.round(data.totalAcres * data.r2r4Pct * 20 * 0.25 * 0.3)
  });

  constraints.push({
    regulation: 'Parking Minimums',
    harmClass: 'mixed',
    impact: '2+ spaces required per unit (adds $50K+ per unit)',
    binding: !reforms.noParkingMinimums,
    potentialUnits: Math.round(impact.potentialUnits * 0.15)
  });

  if (data.isHillside) {
    constraints.push({
      regulation: 'Hillside Ordinance (2011)',
      harmClass: 'mixed',
      impact: 'Slope-based FAR limits, 1,000 cu yd grading cap',
      binding: !reforms.noHillsideOrdinance,
      potentialUnits: Math.round(impact.potentialUnits * 0.5)
    });
  }

  constraints.push({
    regulation: 'CEQA Environmental Review',
    harmClass: 'mixed',
    impact: 'Adds 6-18 months to project timeline',
    binding: !reforms.noCEQA,
    potentialUnits: Math.round(impact.potentialUnits * 0.10)
  });

  // Current vs potential
  const currentEstimate = Math.round(data.totalAcres * (
    data.r1Pct * 4 +      // R1: ~4 units/acre
    data.r2r4Pct * 20 +   // Multi-family: ~20 units/acre
    data.commercialPct * 5 // Commercial: ~5 units/acre (mixed use)
  ));

  return {
    zipcode,
    name: data.name,
    totalAcres: data.totalAcres,
    r1Pct: data.r1Pct,
    r2r4Pct: data.r2r4Pct,
    commercialPct: data.commercialPct,
    industrialPct: data.industrialPct,
    isHillside: data.isHillside,
    currentUnits: currentEstimate,
    potentialUnits: impact.potentialUnits,
    additionalUnits: impact.potentialUnits,
    gdpImpact,
    constraints
  };
}

/**
 * Format GDP value for display
 */
export function formatGDP(value) {
  if (value === null || value === undefined) return '—';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

/**
 * Format units value for display
 */
export function formatUnits(value) {
  if (value === null || value === undefined) return '—';
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return value.toLocaleString();
}

/**
 * Get reform description
 */
export function getReformDescription(reformId) {
  return REFORM_IMPACTS[reformId]?.description || '';
}

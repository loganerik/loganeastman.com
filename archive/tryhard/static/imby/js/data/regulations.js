/**
 * IMBY - LA Regulations Database
 * Historical timeline of land use regulations affecting development
 */

export const regulations = [
  {
    id: 'zoning-1908',
    name: 'First Zoning Ordinance',
    shortName: 'Industrial Districts',
    effectiveDate: new Date('1908-01-01'),
    endDate: null,
    jurisdiction: 'city',
    category: 'zoning',
    harmClassification: 'true_harm',
    description: 'Established six industrial districts to separate noxious uses from residential areas.',
    constraints: {
      prohibitedUses: ['industrial_in_residential']
    },
    citations: [
      'Los Angeles Ordinance 16170 (1908)',
      'Whitnall, G. (1931). History of Zoning. The Annals of the American Academy'
    ]
  },
  {
    id: 'height-1905',
    name: 'Height Limit Ordinance',
    shortName: 'Height Limits',
    effectiveDate: new Date('1905-01-01'),
    endDate: null,
    jurisdiction: 'city',
    category: 'zoning',
    harmClassification: 'mixed',
    description: '150 foot maximum height limit (~13 stories). Originally for fire safety.',
    constraints: {
      maxHeight: 150
    },
    citations: [
      'Los Angeles Building Code (1905)',
      'Fogelson, R. (1967). The Fragmented Metropolis: Los Angeles, 1850-1930'
    ]
  },
  {
    id: 'zoning-1921',
    name: 'Comprehensive Zoning Ordinance',
    shortName: 'Five-Zone System',
    effectiveDate: new Date('1921-06-01'),
    endDate: null,
    jurisdiction: 'city',
    category: 'zoning',
    harmClassification: 'mixed',
    description: 'Established comprehensive 5-zone system (A through E) covering all land uses.',
    constraints: {
      zonedUses: true
    },
    citations: [
      'Los Angeles Ordinance 42666 (1921)',
      'City of Los Angeles, Zoning Map (1921)'
    ]
  },
  {
    id: 'downzoning-1934',
    name: 'FHA-Era Downzoning',
    shortName: 'Single-Family Conversion',
    effectiveDate: new Date('1934-01-01'),
    endDate: null,
    jurisdiction: 'city',
    category: 'zoning',
    harmClassification: 'preference',
    description: '14 miles of street frontage rezoned from multi-family to single-family only. Part of FHA-influenced racial exclusion policies.',
    constraints: {
      allowedUses: ['single_family']
    },
    citations: [
      'Whittemore, A. (2021). Exclusionary Zoning: Origins and Effects',
      'Rothstein, R. (2017). The Color of Law'
    ]
  },
  {
    id: 'parking-1950s',
    name: 'Parking Minimums',
    shortName: 'Parking Requirements',
    effectiveDate: new Date('1950-01-01'),
    endDate: null,
    jurisdiction: 'city',
    category: 'zoning',
    harmClassification: 'mixed',
    description: 'Required off-street parking for all new development. Typically 1-2 spaces per unit residential, more for commercial.',
    constraints: {
      minParkingSpaces: 2
    },
    citations: [
      'Shoup, D. (2005). The High Cost of Free Parking',
      'Los Angeles Municipal Code Section 12.21'
    ]
  },
  {
    id: 'ceqa-1970',
    name: 'California Environmental Quality Act',
    shortName: 'CEQA',
    effectiveDate: new Date('1970-01-01'),
    endDate: null,
    jurisdiction: 'state',
    category: 'environmental',
    harmClassification: 'mixed',
    description: 'Requires environmental review for discretionary projects. Legitimate environmental protection often weaponized to block development.',
    constraints: {
      requiresEnvironmentalReview: true
    },
    citations: [
      'California Public Resources Code, Division 13',
      'Hernandez, J. (2018). In the Name of the Environment: CEQA and Its Discontents'
    ]
  },
  {
    id: 'prop13-1978',
    name: 'Proposition 13',
    shortName: 'Prop 13',
    effectiveDate: new Date('1978-06-06'),
    endDate: null,
    jurisdiction: 'state',
    category: 'fiscal',
    harmClassification: 'preference',
    description: 'Property tax freeze creates fiscalization of land use—cities prefer commercial over residential to maximize sales tax revenue.',
    constraints: {
      fiscalDistortion: true
    },
    citations: [
      'California Constitution, Article XIII A',
      'Fulton, W. (2001). The Reluctant Metropolis'
    ]
  },
  {
    id: 'specific-plans-1946',
    name: 'Specific Plan System',
    shortName: 'Specific Plans',
    effectiveDate: new Date('1946-01-01'),
    endDate: null,
    jurisdiction: 'city',
    category: 'zoning',
    harmClassification: 'mixed',
    description: 'Area-specific zoning overlays with additional restrictions beyond base zoning.',
    constraints: {
      overlayRestrictions: true
    },
    citations: [
      'Los Angeles City Planning, Specific Plans Overview'
    ]
  },
  {
    id: 'bho-2011',
    name: 'Baseline Hillside Ordinance',
    shortName: 'Hillside Ordinance',
    effectiveDate: new Date('2011-01-01'),
    endDate: null,
    jurisdiction: 'city',
    category: 'design',
    harmClassification: 'mixed',
    description: 'Strict FAR limits tied to slope, grading limits, height restrictions for hillside lots. Prevents Hollywood Hills-style development.',
    constraints: {
      slopeFAR: true,
      maxGradingByRight: 1000
    },
    citations: [
      'Los Angeles Municipal Code Section 12.21 C.10',
      'LA Conservancy. Baseline Hillside Ordinance History'
    ]
  },
  {
    id: 'bho-2017',
    name: 'BHO Amendments',
    shortName: 'Grading Limits',
    effectiveDate: new Date('2017-01-01'),
    endDate: null,
    jurisdiction: 'city',
    category: 'design',
    harmClassification: 'mixed',
    description: 'Reduced by-right grading to 1,000 cubic yards. Larger projects require discretionary approval.',
    constraints: {
      maxGradingByRight: 1000
    },
    citations: [
      'Los Angeles Ordinance 184802 (2017)'
    ]
  },
  {
    id: 'sb9-2021',
    name: 'Senate Bill 9',
    shortName: 'SB 9',
    effectiveDate: new Date('2022-01-01'),
    endDate: null,
    jurisdiction: 'state',
    category: 'zoning',
    harmClassification: 'reform',
    description: 'Allows duplexes and lot splits on single-family lots statewide. First major reform in decades.',
    constraints: {
      allowedUses: ['duplex', 'lot_split']
    },
    citations: [
      'California Government Code Section 65852.21',
      'Terner Center (2022). SB 9 Implementation Study'
    ]
  }
];

export function getRegulationsForYear(year) {
  return regulations.filter(r => {
    const effectiveYear = r.effectiveDate.getFullYear();
    const endYear = r.endDate ? r.endDate.getFullYear() : Infinity;
    return year >= effectiveYear && year <= endYear;
  });
}

export function getRegulationById(id) {
  return regulations.find(r => r.id === id);
}

export function getRegulationsByClassification(classification) {
  return regulations.filter(r => r.harmClassification === classification);
}

export const presetScenarios = {
  pre1921: {
    name: 'Pre-1921 Los Angeles',
    description: 'Before comprehensive zoning. Only industrial separation existed.',
    year: 1920,
    reforms: {
      removeR1: true,
      noHeightLimits: true,
      noFARLimits: true,
      noParkingMinimums: true,
      noSetbacks: true,
      noHillsideOrdinance: true,
      noCEQA: true
    }
  },
  '1950s': {
    name: '1950s Development Pattern',
    description: 'Post-war boom. Zoning exists but no CEQA or hillside restrictions.',
    year: 1955,
    reforms: {
      removeR1: false,
      noHeightLimits: false,
      noFARLimits: false,
      noParkingMinimums: false,
      noSetbacks: false,
      noHillsideOrdinance: true,
      noCEQA: true
    }
  },
  tokyo: {
    name: 'Tokyo-Style',
    description: 'Japanese-style national zoning. Minimal local control, by-right development.',
    year: 2026,
    reforms: {
      removeR1: true,
      noHeightLimits: false,
      noFARLimits: true,
      noParkingMinimums: true,
      noSetbacks: true,
      noHillsideOrdinance: false,
      noCEQA: true
    }
  },
  sb9: {
    name: 'SB 9 Future',
    description: 'Current reforms fully utilized. Duplexes and lot splits allowed on R1.',
    year: 2026,
    reforms: {
      removeR1: true,
      noHeightLimits: false,
      noFARLimits: false,
      noParkingMinimums: false,
      noSetbacks: false,
      noHillsideOrdinance: false,
      noCEQA: false
    }
  }
};

/**
 * IMBY - Historical Transit Data
 * Pacific Electric, LA Railway, and Metro routes by era
 * Freeway construction history
 */

// Simplified route coordinates for major transit lines
// Format: array of [lat, lng] pairs forming a polyline

export const PACIFIC_ELECTRIC_ROUTES = {
  // Red Car interurban lines
  'hollywood': {
    name: 'Hollywood Line',
    operator: 'Pacific Electric',
    startYear: 1901,
    endYear: 1955,
    color: '#cc0000',
    coords: [
      [34.0561, -118.2365], // Union Station area
      [34.0625, -118.2450], // Downtown
      [34.0730, -118.2580], // Echo Park area
      [34.0870, -118.2750], // Los Feliz
      [34.0980, -118.2920], // Hollywood/Western
      [34.1010, -118.3110], // Hollywood/Vine
      [34.1020, -118.3380], // Hollywood/Highland
    ]
  },
  'glendale': {
    name: 'Glendale-Burbank Line',
    operator: 'Pacific Electric',
    startYear: 1904,
    endYear: 1955,
    color: '#cc0000',
    coords: [
      [34.0561, -118.2365], // Union Station
      [34.0750, -118.2350], // Cypress Park
      [34.1200, -118.2500], // Glendale
      [34.1540, -118.2600], // Downtown Glendale
      [34.1810, -118.3080], // Burbank
    ]
  },
  'pasadena': {
    name: 'Pasadena Short Line',
    operator: 'Pacific Electric',
    startYear: 1902,
    endYear: 1951,
    color: '#cc0000',
    coords: [
      [34.0561, -118.2365], // Union Station
      [34.0720, -118.2150], // Lincoln Heights
      [34.0900, -118.1920], // Highland Park
      [34.1100, -118.1700], // South Pasadena
      [34.1450, -118.1440], // Pasadena
    ]
  },
  'longBeach': {
    name: 'Long Beach Line',
    operator: 'Pacific Electric',
    startYear: 1902,
    endYear: 1961, // Last Red Car line
    color: '#cc0000',
    coords: [
      [34.0561, -118.2365], // Union Station
      [34.0300, -118.2400], // South of downtown
      [33.9900, -118.2300], // Watts
      [33.9400, -118.2200], // Compton area
      [33.8800, -118.2100], // North Long Beach
      [33.7680, -118.1890], // Downtown Long Beach
    ]
  },
  'santaMonica': {
    name: 'Santa Monica Air Line',
    operator: 'Pacific Electric',
    startYear: 1909,
    endYear: 1953,
    color: '#cc0000',
    coords: [
      [34.0400, -118.2500], // Downtown LA
      [34.0350, -118.2900], // Mid-City
      [34.0280, -118.3400], // Culver City area
      [34.0150, -118.4200], // West LA
      [34.0100, -118.4900], // Santa Monica
    ]
  },
  'venice': {
    name: 'Venice Short Line',
    operator: 'Pacific Electric',
    startYear: 1902,
    endYear: 1950,
    color: '#cc0000',
    coords: [
      [34.0400, -118.2500], // Downtown LA
      [34.0200, -118.3000], // West Adams
      [33.9980, -118.3800], // Culver City
      [33.9930, -118.4600], // Mar Vista
      [33.9900, -118.4750], // Venice
    ]
  },
  'sanFernando': {
    name: 'San Fernando Valley Line',
    operator: 'Pacific Electric',
    startYear: 1911,
    endYear: 1952,
    color: '#cc0000',
    coords: [
      [34.0980, -118.3200], // Hollywood
      [34.1400, -118.3550], // Universal area (via subway)
      [34.1700, -118.3760], // North Hollywood
      [34.1850, -118.4100], // Van Nuys
      [34.2100, -118.4700], // Reseda
    ]
  },
  'whittier': {
    name: 'Whittier Line',
    operator: 'Pacific Electric',
    startYear: 1904,
    endYear: 1958,
    color: '#cc0000',
    coords: [
      [34.0561, -118.2365], // Union Station
      [34.0400, -118.1900], // East LA
      [34.0250, -118.1400], // Montebello
      [33.9770, -118.0320], // Whittier
    ]
  },
};

export const LA_RAILWAY_ROUTES = {
  // Yellow Car local streetcar lines
  'vermont': {
    name: 'Vermont Avenue Line',
    operator: 'LA Railway',
    startYear: 1895,
    endYear: 1955,
    color: '#ffcc00',
    coords: [
      [34.0100, -118.2920], // Vermont/Exposition
      [34.0400, -118.2920], // Vermont/Wilshire
      [34.0620, -118.2920], // Vermont/Beverly
      [34.0870, -118.2920], // Vermont/Hollywood
      [34.1020, -118.2920], // Vermont/Franklin
    ]
  },
  'western': {
    name: 'Western Avenue Line',
    operator: 'LA Railway',
    startYear: 1903,
    endYear: 1955,
    color: '#ffcc00',
    coords: [
      [33.9400, -118.3090], // Western/Imperial
      [33.9850, -118.3090], // Western/Slauson
      [34.0280, -118.3090], // Western/Wilshire
      [34.0640, -118.3090], // Western/Beverly
      [34.1010, -118.3090], // Western/Hollywood
    ]
  },
  'pico': {
    name: 'Pico Boulevard Line',
    operator: 'LA Railway',
    startYear: 1898,
    endYear: 1954,
    color: '#ffcc00',
    coords: [
      [34.0380, -118.2550], // Downtown
      [34.0370, -118.3000], // Pico/Western
      [34.0350, -118.3600], // Pico/La Brea
      [34.0320, -118.4400], // Pico/Sawtelle
    ]
  },
  'sunset': {
    name: 'Sunset Boulevard Line',
    operator: 'LA Railway',
    startYear: 1904,
    endYear: 1954,
    color: '#ffcc00',
    coords: [
      [34.0560, -118.2450], // Downtown
      [34.0750, -118.2650], // Echo Park/Sunset
      [34.0900, -118.2900], // Sunset/Western
      [34.0970, -118.3400], // Sunset/Highland
    ]
  },
  'santa-monica-blvd': {
    name: 'Santa Monica Boulevard Line',
    operator: 'LA Railway',
    startYear: 1896,
    endYear: 1953,
    color: '#ffcc00',
    coords: [
      [34.0500, -118.2550], // Downtown
      [34.0750, -118.2850], // Santa Monica/Vermont
      [34.0830, -118.3200], // Santa Monica/Western
      [34.0870, -118.3600], // West Hollywood
    ]
  },
  'hoover': {
    name: 'Hoover Street Line',
    operator: 'LA Railway',
    startYear: 1902,
    endYear: 1955,
    color: '#ffcc00',
    coords: [
      [34.0180, -118.2840], // Hoover/Adams
      [34.0380, -118.2840], // Hoover/Pico
      [34.0580, -118.2840], // Hoover/Wilshire
      [34.0780, -118.2840], // Hoover/Hollywood
    ]
  },
};

export const METRO_ROUTES = {
  // Modern Metro Rail (2026)
  'blueLine': {
    name: 'A Line (Blue)',
    operator: 'Metro',
    startYear: 1990,
    endYear: null,
    color: '#0072bc',
    coords: [
      [34.0400, -118.2660], // 7th/Metro
      [33.9900, -118.2300], // Watts
      [33.8800, -118.2100], // Compton
      [33.7680, -118.1890], // Long Beach
    ]
  },
  'redLine': {
    name: 'B Line (Red)',
    operator: 'Metro',
    startYear: 1993,
    endYear: null,
    color: '#eb131b',
    coords: [
      [34.0561, -118.2365], // Union Station
      [34.0556, -118.2467], // Civic Center
      [34.0494, -118.2514], // Pershing Square
      [34.0400, -118.2560], // 7th/Metro
      [34.0475, -118.2590], // Westlake/MacArthur
      [34.0560, -118.2650], // Wilshire/Vermont
      [34.0620, -118.3070], // Wilshire/Western
      [34.0730, -118.2920], // Hollywood/Western
      [34.1016, -118.3267], // Hollywood/Highland
      [34.1065, -118.3384], // Hollywood/Vine
      [34.1685, -118.3765], // North Hollywood
    ]
  },
  'purpleLine': {
    name: 'D Line (Purple)',
    operator: 'Metro',
    startYear: 1996,
    endYear: null,
    color: '#a05da5',
    coords: [
      [34.0561, -118.2365], // Union Station
      [34.0400, -118.2560], // 7th/Metro
      [34.0475, -118.2590], // Wilshire/Vermont
      [34.0620, -118.3070], // Wilshire/Western
      [34.0620, -118.3350], // Wilshire/Normandie
      [34.0620, -118.3770], // Wilshire/La Brea (2023)
      [34.0620, -118.3940], // Wilshire/Fairfax (2024)
      [34.0580, -118.4170], // Wilshire/La Cienega (2025)
      [34.0530, -118.4380], // Wilshire/Rodeo (planned)
    ]
  },
  'goldLine': {
    name: 'L Line (Gold)',
    operator: 'Metro',
    startYear: 2003,
    endYear: null,
    color: '#f9a825',
    coords: [
      [34.0561, -118.2365], // Union Station
      [34.0650, -118.2350], // Chinatown
      [34.0750, -118.2200], // Lincoln Heights
      [34.0900, -118.1920], // Highland Park
      [34.1100, -118.1700], // South Pasadena
      [34.1450, -118.1440], // Memorial Park
      [34.1480, -118.1350], // Del Mar
      [34.1360, -118.1230], // Sierra Madre Villa
    ]
  },
  'expoLine': {
    name: 'E Line (Expo)',
    operator: 'Metro',
    startYear: 2012,
    endYear: null,
    color: '#22b573',
    coords: [
      [34.0400, -118.2560], // 7th/Metro
      [34.0300, -118.2650], // Pico
      [34.0290, -118.2800], // LATTC
      [34.0260, -118.3000], // Expo/Vermont
      [34.0270, -118.3350], // Expo/Western
      [34.0275, -118.3600], // Expo/La Brea
      [34.0280, -118.3800], // Farmdale
      [34.0285, -118.3950], // Expo/La Cienega
      [34.0270, -118.4180], // Culver City
      [34.0200, -118.4400], // Palms
      [34.0130, -118.4700], // Westwood/Rancho Park
      [34.0100, -118.4900], // 26th/Bergamot
      [34.0110, -118.4960], // Downtown Santa Monica
    ]
  },
  'cLine': {
    name: 'C Line (Green)',
    operator: 'Metro',
    startYear: 1995,
    endYear: null,
    color: '#00a651',
    coords: [
      [33.9150, -118.3795], // Redondo Beach
      [33.9300, -118.3520], // Aviation/LAX
      [33.9530, -118.3380], // Hawthorne
      [33.9640, -118.3050], // Vermont/Athens
      [33.9640, -118.2500], // Harbor Freeway
      [33.9230, -118.2280], // Willowbrook
      [33.8900, -118.1730], // Norwalk
    ]
  },
};

// Major LA freeways with construction dates
export const FREEWAYS = {
  '110-north': {
    name: 'Arroyo Seco Parkway (110 N)',
    number: '110',
    constructionStart: 1938,
    opened: 1940,
    note: 'First freeway in Western US',
    color: '#555555',
    coords: [
      [34.0561, -118.2365], // Downtown
      [34.0800, -118.2200], // Chinatown area
      [34.1050, -118.1930], // Highland Park
      [34.1250, -118.1650], // South Pasadena
    ]
  },
  '110-south': {
    name: 'Harbor Freeway (110 S)',
    number: '110',
    constructionStart: 1952,
    opened: 1970,
    color: '#555555',
    coords: [
      [34.0400, -118.2660], // Downtown
      [33.9900, -118.2810], // Vernon
      [33.9400, -118.2810], // Florence
      [33.8700, -118.2810], // Gardena
      [33.7900, -118.2810], // Torrance
    ]
  },
  '101-hollywood': {
    name: 'Hollywood Freeway (101)',
    number: '101',
    constructionStart: 1947,
    opened: 1968,
    note: 'Route followed/replaced streetcar corridors',
    color: '#555555',
    coords: [
      [34.0561, -118.2365], // Downtown
      [34.0750, -118.2600], // Echo Park
      [34.0920, -118.2850], // Hollywood
      [34.1400, -118.3550], // Universal City
      [34.1700, -118.3760], // North Hollywood
      [34.2200, -118.4400], // Woodland Hills
    ]
  },
  '10': {
    name: 'Santa Monica Freeway (10)',
    number: '10',
    constructionStart: 1957,
    opened: 1966,
    note: 'Bisected South Central and Mid-City neighborhoods',
    color: '#555555',
    coords: [
      [34.0400, -118.2560], // Downtown
      [34.0300, -118.3000], // Western
      [34.0280, -118.3600], // La Brea
      [34.0250, -118.4200], // Robertson
      [34.0200, -118.4700], // Bundy
      [34.0150, -118.4950], // Santa Monica
    ]
  },
  '5-south': {
    name: 'Golden State Freeway (5 S)',
    number: '5',
    constructionStart: 1956,
    opened: 1962,
    note: 'Eastern edge of Boyle Heights, displaced communities',
    color: '#555555',
    coords: [
      [34.0561, -118.2365], // Downtown
      [34.0350, -118.2150], // Boyle Heights
      [33.9800, -118.1900], // Commerce
      [33.9200, -118.1600], // Downey
      [33.8500, -118.1200], // Norwalk
    ]
  },
  '5-north': {
    name: 'Golden State Freeway (5 N)',
    number: '5',
    constructionStart: 1956,
    opened: 1965,
    color: '#555555',
    coords: [
      [34.0561, -118.2365], // Downtown
      [34.1200, -118.2600], // Glendale
      [34.1800, -118.3100], // Burbank
      [34.2800, -118.4200], // Newhall
    ]
  },
  '60': {
    name: 'Pomona Freeway (60)',
    number: '60',
    constructionStart: 1964,
    opened: 1972,
    note: 'Southern edge of Boyle Heights',
    color: '#555555',
    coords: [
      [34.0350, -118.2150], // Downtown/Boyle Heights
      [34.0100, -118.1400], // Montebello
      [33.9900, -118.0800], // Pico Rivera
      [33.9800, -118.0200], // Whittier area
    ]
  },
  '405': {
    name: 'San Diego Freeway (405)',
    number: '405',
    constructionStart: 1957,
    opened: 1969,
    color: '#555555',
    coords: [
      [33.9500, -118.3850], // LAX area
      [34.0200, -118.4300], // Culver City
      [34.0580, -118.4500], // Westwood
      [34.1550, -118.4680], // Sherman Oaks
      [34.2300, -118.4700], // Van Nuys
    ]
  },
  '710': {
    name: 'Long Beach Freeway (710)',
    number: '710',
    constructionStart: 1953,
    opened: 1965,
    note: 'Followed Pacific Electric Long Beach Line corridor',
    color: '#555555',
    coords: [
      [34.0400, -118.2150], // East LA
      [33.9600, -118.2100], // South Gate
      [33.8900, -118.2000], // Compton
      [33.7800, -118.1900], // Long Beach
    ]
  },
};

// Get transit routes active in a given year
export function getTransitForYear(year) {
  const routes = [];

  // Pacific Electric (Red Cars)
  Object.entries(PACIFIC_ELECTRIC_ROUTES).forEach(([id, route]) => {
    if (year >= route.startYear && year <= route.endYear) {
      routes.push({ ...route, id, type: 'pe' });
    }
  });

  // LA Railway (Yellow Cars)
  Object.entries(LA_RAILWAY_ROUTES).forEach(([id, route]) => {
    if (year >= route.startYear && year <= route.endYear) {
      routes.push({ ...route, id, type: 'lary' });
    }
  });

  // Metro (modern)
  Object.entries(METRO_ROUTES).forEach(([id, route]) => {
    if (year >= route.startYear) {
      routes.push({ ...route, id, type: 'metro' });
    }
  });

  return routes;
}

// Get freeways built by a given year
export function getFreewaysForYear(year) {
  const freeways = [];

  Object.entries(FREEWAYS).forEach(([id, freeway]) => {
    if (year >= freeway.opened) {
      freeways.push({ ...freeway, id, status: 'open' });
    } else if (year >= freeway.constructionStart) {
      freeways.push({ ...freeway, id, status: 'construction' });
    }
  });

  return freeways;
}

// Transit eras for visualization
export const TRANSIT_ERAS = [
  { year: 1910, label: '1910: Streetcar Peak', description: 'PE + LARy at maximum coverage' },
  { year: 1945, label: '1945: Pre-Decline', description: 'Last year before systematic dismantling' },
  { year: 1955, label: '1955: Yellow Cars End', description: 'Local streetcar service ends' },
  { year: 1961, label: '1961: Red Cars End', description: 'Last Pacific Electric line closes' },
  { year: 1990, label: '1990: Metro Begins', description: 'Blue Line opens—first new rail' },
  { year: 2026, label: '2026: Today', description: 'Current Metro system' },
];

/**
 * IMBY - Zipcode Narratives
 * Every zipcode is a case study of how regulation shaped development
 */

// Key regulatory timeline affecting all of LA
// Includes zoning, transportation, and urban renewal - all shaped development patterns
export const REGULATORY_TIMELINE = [
  // === STREETCAR ERA: EXPANSION & CONSOLIDATION ===
  { year: 1874, name: 'First Streetcar', description: 'Horse-drawn streetcar on Spring St begins transit-oriented development', category: 'transit' },
  { year: 1887, name: 'Cable Cars Begin', description: '2nd Street cable car makes Bunker Hill accessible residential neighborhood', category: 'transit' },
  { year: 1895, name: 'LA Consolidated Railway', description: 'First major consolidation of local streetcar lines', category: 'transit' },
  { year: 1898, name: 'Los Angeles Railway (LARy)', description: 'Huntington consolidates local "Yellow Car" lines', category: 'transit' },
  { year: 1901, name: 'Pacific Electric Launches', description: 'Huntington\'s interurban "Red Car" system begins—suburban expansion accelerates', category: 'transit' },
  { year: 1905, name: 'Height Limit Ordinance', description: '150ft max height established for fire safety', category: 'zoning' },
  { year: 1908, name: 'First Zoning', description: 'Industrial districts separated from residential', category: 'zoning' },
  { year: 1910, name: 'PE Peak Route Mileage', description: 'Pacific Electric reaches 1,000+ miles of track—largest electric railway in the world', category: 'transit' },
  { year: 1911, name: 'Southern Pacific Acquires PE', description: 'Freight interests now control interurban rail', category: 'transit' },
  { year: 1921, name: 'Comprehensive Zoning', description: 'LA adopts 5-zone system covering all land', category: 'zoning' },
  { year: 1923, name: 'Streetcar Peak Ridership', description: 'PE and LARy at peak—~109 million annual riders on PE alone', category: 'transit' },
  { year: 1930, name: 'Setback Requirements', description: 'Front and side yard minimums established', category: 'zoning' },

  // === DECLINE & DISMANTLING ===
  { year: 1940, name: 'National City Lines Arrives', description: 'GM/Standard Oil/Firestone consortium begins acquiring transit systems', category: 'transit' },
  { year: 1940, name: 'Arroyo Seco Parkway Opens', description: 'First LA freeway (later 110)—auto era begins', category: 'freeway' },
  { year: 1946, name: 'Specific Plans Begin', description: 'Area-specific overlays add restrictions', category: 'zoning' },
  { year: 1949, name: 'Federal Housing Act', description: 'Urban renewal funding for "slum clearance" programs', category: 'urban-renewal' },
  { year: 1950, name: 'Parking Minimums', description: 'Off-street parking required for all new buildings', category: 'zoning' },
  { year: 1953, name: 'Hollywood Freeway Opens', description: '101 through Hollywood—streetcar tracks removed', category: 'freeway' },
  { year: 1954, name: 'PE Conversion Begins', description: 'First Red Car lines converted to buses', category: 'transit' },
  { year: 1955, name: 'Last Yellow Car', description: 'LA Railway local streetcar service ends', category: 'transit' },
  { year: 1955, name: 'Bunker Hill Redevelopment Begins', description: 'CRA begins acquiring Victorian neighborhood via eminent domain', category: 'urban-renewal' },
  { year: 1956, name: 'FHA Downzoning', description: 'Miles of multi-family corridors rezoned to R1 only', category: 'zoning' },
  { year: 1956, name: 'Interstate Highway Act', description: 'Federal funding accelerates freeway construction through urban neighborhoods', category: 'freeway' },
  { year: 1961, name: 'Last Red Car', description: 'Final Pacific Electric line (Long Beach) closes—end of interurban rail until 1990', category: 'transit' },
  { year: 1961, name: 'Santa Monica Freeway', description: '10 freeway bisects South Central and Mid-City neighborhoods', category: 'freeway' },
  { year: 1964, name: 'Bunker Hill Cleared', description: '11,000 residents displaced, Victorian homes demolished for corporate towers', category: 'urban-renewal' },
  { year: 1969, name: 'Angel\'s Flight Closes', description: 'Funicular railway to Bunker Hill shut down as neighborhood erased', category: 'urban-renewal' },
  { year: 1970, name: 'CEQA Enacted', description: 'Environmental review required for projects', category: 'zoning' },
  { year: 1978, name: 'Proposition 13', description: 'Property tax freeze distorts land use incentives', category: 'zoning' },
  { year: 1986, name: 'Density Reductions', description: 'Community plans reduce allowed density citywide', category: 'zoning' },

  // === MODERN ERA ===
  { year: 1990, name: 'Metro Blue Line Opens', description: 'First new rail in 30 years—follows freight corridor, not original PE route', category: 'transit' },
  { year: 1993, name: 'Metro Red Line Opens', description: 'Subway through Hollywood—but former PE corridors like Vermont still unserved', category: 'transit' },
  { year: 2001, name: 'Mansionization Begins', description: 'First restrictions on single-family home size', category: 'zoning' },
  { year: 2008, name: 'Baseline Mansionization', description: 'Citywide limits on home size and FAR', category: 'zoning' },
  { year: 2010, name: 'Angel\'s Flight Reopens', description: 'Funicular restored—but Bunker Hill residential neighborhood never rebuilt', category: 'urban-renewal' },
  { year: 2011, name: 'Hillside Ordinance', description: 'Slope-based FAR limits, grading caps for hills', category: 'zoning' },
  { year: 2016, name: 'Expo Line to Santa Monica', description: 'New rail along former PE corridor—nearly identical route, 55 years later', category: 'transit' },
  { year: 2017, name: 'Grading Restrictions', description: 'By-right grading reduced to 1,000 cubic yards', category: 'zoning' },
  { year: 2022, name: 'SB 9 Reform', description: 'State allows duplexes on R1 lots (partial reform)', category: 'zoning' },
];

// Get regulations active in a given year
export function getRegulationsForYear(year) {
  return REGULATORY_TIMELINE.filter(r => r.year <= year);
}

// Rich narratives for each zipcode
export const ZIPCODE_NARRATIVES = {
  // === HOLLYWOOD HILLS ===
  '90068': {
    name: 'Hollywood Hills',
    era: '1920s-1940s',
    story: `The Hollywood Hills represent LA's most dramatic example of "impossible to replicate" development. The iconic estates perched on steep hillsides—many built for film industry pioneers in the 1920s-40s—would be illegal to construct today.

**What Changed:**
- **1920s-1940s**: Minimal regulation. Developers cut roads into hillsides, graded freely, built where they wanted.
- **2011**: Baseline Hillside Ordinance caps FAR based on slope. A lot with 50% slope gets only 0.45 FAR.
- **2017**: Grading limited to 1,000 cubic yards by-right. Historic estates often moved 10,000+ cubic yards.

**The Math**: A typical Hollywood Hills lot (15,000 sq ft, 40% slope) could support a 6,000 sq ft home in 1940. Today: ~3,000 sq ft max. The neighborhood's character was built under rules that no longer exist.`,
    peakDevelopment: 1945,
    keyRegulations: ['Hillside Ordinance (2011)', 'Grading Limits (2017)', 'CEQA (1970)'],
    whatWasLost: 'Large estate homes on steep lots, dramatic hillside architecture',
    ifReformed: 'Could add ~2,500 units through hillside ADUs and lot splits'
  },

  '90046': {
    name: 'Hollywood Hills West',
    era: '1920s-1950s',
    story: `Laurel Canyon and the western Hollywood Hills developed as an artists' colony and bohemian enclave. Small cabins, bungalows, and eccentric homes filled the winding canyon roads.

**What Changed:**
- **Pre-1950**: Artists and musicians built informal structures, often without permits
- **1970**: CEQA made any significant project subject to environmental review
- **2011**: Hillside Ordinance restricted rebuilding to smaller footprints

**The Irony**: The "funky" character that makes Laurel Canyon desirable was built informally. Today, even rebuilding a burned cabin requires years of approvals.`,
    peakDevelopment: 1955,
    keyRegulations: ['Hillside Ordinance (2011)', 'Fire Zone Requirements', 'CEQA (1970)'],
    whatWasLost: 'Informal construction, artist studios, small canyon cabins',
    ifReformed: 'Could rebuild fire-damaged homes faster, add ~1,800 units'
  },

  '90027': {
    name: 'Los Feliz / Griffith',
    era: '1910s-1930s',
    story: `Los Feliz was a streetcar suburb—dense, walkable, mixed-use development that grew organically around the Pacific Electric and LA Railway lines. The neighborhood's character (dingbats, courtyard apartments, corner stores) was built before zoning restricted it.

**The Transit Connection:**
Multiple streetcar lines converged here: the Red Car Hollywood line, Yellow Car routes on Vermont and Hillhurst, and the Glendale-Burbank interurban. Development concentrated within walking distance of stops. Businesses located where foot traffic was highest—near stations.

**What Changed:**
- **1901-1920s**: Pacific Electric and LARy expansion drives residential development
- **1910s-1920s**: Apartments, bungalow courts, and mixed-use buildings built by-right
- **1955**: Local Yellow Car lines end
- **1955**: Red Car Hollywood line ends
- **1956**: Downzoning converted multi-family zones to R1-only
- **1986**: Community plan reduced allowed density further

**Today**: The charming 1920s fourplexes are now "non-conforming"—legal to keep but illegal to build. Vermont Avenue had a streetcar; now it has a bus. The Metro Red Line runs underground nearby, but former streetcar corridors like Hillhurst and Vermont remain unserved by rail.`,
    peakDevelopment: 1928,
    keyRegulations: ['Streetcar Removal (1955)', 'Downzoning (1956)', 'R1 Restrictions', 'Parking Minimums'],
    whatWasLost: 'Bungalow courts, small apartment buildings, corner retail, transit-oriented density',
    ifReformed: 'Could add ~8,500 units by allowing what already exists'
  },

  // === WESTSIDE ===
  '90024': {
    name: 'Westwood',
    era: '1920s-1960s',
    story: `Westwood was master-planned in the 1920s as a "complete community" with apartments, shops, and UCLA. The Westwood Village commercial district thrived for decades.

**What Changed:**
- **1920s-1960s**: High-rise apartments and office buildings constructed
- **1986**: Community plan capped heights, reduced density
- **2000s**: Parking requirements made new development financially infeasible

**The Decline**: Westwood Village went from LA's premier shopping district to struggling storefronts. The cause: parking requirements that doubled construction costs, density limits that prevented residential above retail.`,
    peakDevelopment: 1965,
    keyRegulations: ['Parking Minimums', 'Height Limits', 'Density Caps'],
    whatWasLost: 'Mixed-use vitality, affordable student housing near UCLA',
    ifReformed: 'Could add ~12,000 units near UCLA, revive Village retail'
  },

  '90049': {
    name: 'Brentwood',
    era: '1920s-1950s',
    story: `Brentwood developed as an exclusive enclave with large lots and estate homes. The neighborhood successfully maintained exclusivity through zoning.

**What Changed:**
- **1921**: Zoned for large-lot single-family
- **1956**: Downzoning prevented any multi-family
- **Ongoing**: Residents have successfully opposed any density increases

**The Trade-off**: Brentwood preserved its character but at enormous cost—median home price exceeds $3M. Housing scarcity is a policy choice, not a natural outcome.`,
    peakDevelopment: 1955,
    keyRegulations: ['R1 Zoning', 'Large Lot Minimums', 'CEQA Abuse'],
    whatWasLost: 'Middle-class housing options, workforce housing for service workers',
    ifReformed: 'Could add ~4,200 units through gentle density (ADUs, duplexes)'
  },

  '90077': {
    name: 'Bel Air',
    era: '1920s-1940s',
    story: `Bel Air was developed in 1923 as LA's most exclusive residential community. Private roads, gated entries, and large lots defined the area from the start.

**What Changed:**
- **1923**: Private development with deed restrictions
- **1921+**: Zoning locked in low density permanently
- **2011**: Hillside Ordinance further restricted development

**The Reality**: Bel Air's "natural" exclusivity is actually regulatory. Without zoning, market forces would have allowed some apartments on the flatter areas near Sunset.`,
    peakDevelopment: 1948,
    keyRegulations: ['RE Zoning', 'Hillside Ordinance', 'Private CC&Rs'],
    whatWasLost: 'Any housing diversity, workforce housing',
    ifReformed: 'Could add ~1,500 units on appropriate sites'
  },

  // === COASTAL ===
  '90291': {
    name: 'Venice',
    era: '1900s-1920s',
    story: `Abbot Kinney built Venice in 1905 as "Venice of America"—canals, amusement piers, and dense beachside development. The original vision was urban and walkable.

**What Changed:**
- **1905-1920s**: Dense cottages, apartments, and commercial built along canals
- **1929**: Annexation to LA brought zoning restrictions
- **1956**: Downzoning converted much of Venice to R1
- **1970s**: CEQA made rebuilding the pier and canals nearly impossible

**The Irony**: Venice's "bohemian" character—now worth millions per lot—was built under minimal regulation. Today, building anything like original Venice is illegal.`,
    peakDevelopment: 1925,
    keyRegulations: ['Downzoning (1956)', 'Coastal Commission', 'Parking Minimums'],
    whatWasLost: 'Beach cottages, affordable artist housing, walkable density',
    ifReformed: 'Could add ~6,500 units, rebuild coastal vitality'
  },

  '90292': {
    name: 'Marina del Rey',
    era: '1960s',
    story: `Marina del Rey was built in the 1960s as a master-planned marina community with high-density apartments. It's one of the few LA neighborhoods developed with intentional density.

**What Changed:**
- **1960s**: County-owned land developed with apartments, condos, retail
- **1970s**: CEQA and Coastal Commission slowed new development
- **1990s+**: Height limits and density caps prevented intensification

**Lesson**: When government wanted density, it built Marina del Rey. The result: a vibrant, walkable community. Then regulations prevented replicating it elsewhere.`,
    peakDevelopment: 1972,
    keyRegulations: ['Coastal Commission', 'Height Limits', 'CEQA'],
    whatWasLost: 'Additional waterfront housing, expanded marina facilities',
    ifReformed: 'Could add ~5,200 units while preserving marina character'
  },

  // === CENTRAL LA ===
  '90020': {
    name: 'Koreatown',
    era: '1920s-Present',
    story: `Koreatown is one of LA's densest neighborhoods because it was largely built before modern zoning restrictions. The dingbats, apartment buildings, and mixed-use streets reflect pre-restriction development.

**What Changed:**
- **1920s-1950s**: Apartments and commercial built by-right
- **1986**: Community plan capped further density increases
- **Today**: New projects require lengthy approvals, expensive parking

**The Success Story**: Koreatown proves density works in LA. The neighborhood has transit, walkability, and vitality precisely because it was built before parking minimums and density caps.`,
    peakDevelopment: 1965,
    keyRegulations: ['Parking Minimums', 'Density Caps', 'CEQA'],
    whatWasLost: 'Ability to add more housing in a transit-rich area',
    ifReformed: 'Could add ~15,000 units along transit corridors'
  },

  '90005': {
    name: 'Koreatown West',
    era: '1910s-1950s',
    story: `Western Koreatown developed along the Wilshire corridor as LA's first high-rise district outside downtown. The Ambassador Hotel, Bullocks Wilshire, and apartment towers defined the area.

**What Changed:**
- **1920s**: Wilshire's "Miracle Mile" drew dense development
- **1950s**: Parking requirements began strangling new construction
- **1970s-80s**: Height limits prevented new towers

**The Ambassador**: The legendary hotel sat vacant for decades because redevelopment required 800+ parking spaces. It was demolished rather than rebuilt. Parking killed it.`,
    peakDevelopment: 1955,
    keyRegulations: ['Parking Minimums', 'Height Limits', 'Historic Preservation'],
    whatWasLost: 'Wilshire corridor development, landmark adaptive reuse',
    ifReformed: 'Could add ~9,500 units along Wilshire'
  },

  '90036': {
    name: 'Miracle Mile / Fairfax',
    era: '1920s-1950s',
    story: `A.W. Ross created the Miracle Mile in 1920 as America's first auto-oriented shopping district. But even this car-centric development was denser than what zoning allows today.

**Park La Brea (1941-1952):**
The Metropolitan Life Insurance Company built Park La Brea with FHA financing during the WWII labor housing crisis. The 4,255-unit complex was federally subsidized housing for defense workers, exempt from local zoning via federal override. The original garden apartments (1941-43) preceded the towers (1948-52).

This was not market-driven development—it was a federally coordinated response to wartime housing shortages, built by an insurance company under New Deal-era programs. The complex exists in the same policy era that produced urban renewal projects like Bunker Hill's demolition.

**Miracle Mile:**
- **1920s-1940s**: Dense commercial with apartments above, built by-right
- **1956**: Residential areas downzoned to R1
- **1986**: Commercial density capped

**The Gap**: Original Miracle Mile buildings have retail on ground floor, 2-3 floors of apartments above. Today's zoning requires separate buildings for each use, plus massive parking structures.`,
    peakDevelopment: 1948,
    keyRegulations: ['Use Separation', 'Parking Minimums', 'R1 Downzoning'],
    whatWasLost: 'Mixed-use buildings, housing above shops, organic density',
    ifReformed: 'Could add ~7,800 units with mixed-use development'
  },

  // === DOWNTOWN / DTLA ===
  '90012': {
    name: 'Chinatown / Civic Center / Bunker Hill',
    era: '1880s-1960s',
    story: `This area contains two of LA's most significant urban renewal stories—and shows how federal policy destroyed neighborhoods that had developed organically.

**Chinatown:**
Rebuilt twice—first destroyed for Union Station (1930s), then redeveloped as "New Chinatown" (1938). Each iteration was denser than today's zoning would allow. The original Chinatown was demolished without environmental review. Today, adding housing near that same transit hub requires years of CEQA analysis.

**Bunker Hill (1880s-1969):**
Before urban renewal, Bunker Hill was a dense Victorian neighborhood. Built in the 1880s-1900s when the 2nd Street cable car made the steep hill accessible, it housed 11,000+ residents in boarding houses, apartments, and single-family homes. The neighborhood was mixed-income and multigenerational—working class, elderly, immigrants, and artists.

- **1887**: Cable car makes Bunker Hill accessible; dense residential development follows
- **1901**: Angel's Flight funicular opens, connecting Bunker Hill to downtown
- **1955**: Community Redevelopment Agency designates area "blighted," begins acquiring property via eminent domain
- **1964-1969**: 11,000 residents displaced; Victorian homes demolished
- **After**: Corporate towers (Bonaventure Hotel, ARCO Plaza), windswept plazas, no housing for 40 years

Bunker Hill was not "blighted" in any meaningful sense—it was diverse and affordable. Urban renewal erased a functioning neighborhood to build a corporate office park that remained largely empty after business hours until recent residential projects.`,
    peakDevelopment: 1940,
    keyRegulations: ['Urban Renewal (1949 Housing Act)', 'Parking Minimums', 'CEQA'],
    whatWasLost: 'Bunker Hill residential neighborhood (11,000 displaced), original Chinatown, affordable housing near transit',
    ifReformed: 'Could add ~4,800 units near Union Station'
  },

  '90017': {
    name: 'Downtown Financial',
    era: '1900s-1970s',
    story: `Downtown LA was the region's commercial center until the 1970s. Its current form was shaped by both market forces and intentional destruction of adjacent neighborhoods.

**What Changed:**
- **1900s-1970s**: Continuous tower construction downtown
- **1955-1969**: Bunker Hill (adjacent) demolished via urban renewal—corporate towers replaced 11,000 residents
- **1970s**: Office development shifted to Century City, Westside
- **1999**: Adaptive Reuse Ordinance allowed residential conversion
- **Today**: Downtown renaissance limited by parking requirements

**The Urban Renewal Legacy**: The corporate towers west of downtown (Bonaventure, ARCO Plaza, Wells Fargo Center) were built on land cleared by demolishing Bunker Hill's Victorian neighborhood. The area had no residential population for 40 years after urban renewal—the plazas were designed for office workers, not residents.

**The Revival**: Downtown's recent comeback proves density works when allowed. But even here, parking minimums add $50,000+ per unit to construction costs. The Adaptive Reuse Ordinance (1999) enabled the loft conversion movement—proof that reducing regulations creates housing.`,
    peakDevelopment: 1972,
    keyRegulations: ['Urban Renewal', 'Parking Minimums', 'CEQA', 'Inclusionary Requirements'],
    whatWasLost: 'Bunker Hill neighborhood, faster residential conversion, more affordable units',
    ifReformed: 'Could add ~18,000 units downtown'
  },

  // === EASTSIDE ===
  '90026': {
    name: 'Echo Park',
    era: '1900s-1930s',
    story: `Echo Park developed as a working-class streetcar suburb with dense housing, small lots, and walkable streets. The neighborhood's charm is pre-zoning urbanism.

**What Changed:**
- **1900s-1920s**: Bungalow courts, dingbats, small apartments
- **1956**: Downzoning to R1 on hillsides
- **1986**: Community plan reduced allowed density

**The Gentrification Paradox**: Echo Park's "character" that attracts high-income buyers was built for working-class residents under loose regulations. Strict zoning now prevents building affordable housing.`,
    peakDevelopment: 1928,
    keyRegulations: ['R1 Downzoning', 'Hillside Limits', 'Parking Minimums'],
    whatWasLost: 'Bungalow courts, affordable small apartments',
    ifReformed: 'Could add ~5,500 units while preserving character'
  },

  '90039': {
    name: 'Silver Lake',
    era: '1920s-1950s',
    story: `Silver Lake became famous for modernist architecture—Neutra, Schindler, and others built iconic homes on hillside lots. These experiments would be illegal today.

**What Changed:**
- **1930s-1950s**: Architects experimented with hillside construction
- **2011**: Hillside Ordinance restricted building envelope
- **Today**: Rebuilding a Neutra home to original specs often violates code

**The Modernist Irony**: Silver Lake's architectural heritage was built by rule-breakers. The city now preserves these homes as landmarks while prohibiting anyone from building like them.`,
    peakDevelopment: 1955,
    keyRegulations: ['Hillside Ordinance', 'Height Limits', 'FAR Restrictions'],
    whatWasLost: 'Architectural experimentation, modernist homes',
    ifReformed: 'Could add ~4,200 units, enable innovative architecture'
  },

  '90033': {
    name: 'Boyle Heights',
    era: '1880s-1960s',
    story: `Boyle Heights was one of LA's most diverse neighborhoods—home to Jewish, Japanese, Mexican, and Eastern European communities. Dense, walkable, transit-connected. Then the freeways came.

**Before Freeways:**
- **1889**: First streetcar line connects Boyle Heights to downtown
- **1900s-1940s**: Dense residential and commercial development; Brooklyn Avenue (now Cesar Chavez) thrives as commercial corridor
- **1942**: Japanese American residents forcibly removed (internment)
- **1940s**: Largest Jewish community in LA; dozens of synagogues

The neighborhood had multiple Pacific Electric and LA Railway lines connecting it to downtown and beyond. Density concentrated along transit corridors.

**The Freeway Devastation:**
- **1944**: State begins acquiring land for freeway construction
- **1948-1961**: Four major freeways built through or adjacent to Boyle Heights:
  - **101 (Hollywood/Santa Ana)**: Cuts through the neighborhood
  - **5 (Golden State)**: Eastern border
  - **10 (Santa Monica)**: Southern border
  - **60 (Pomona)**: Southern edge
- **1960s**: The intersection of five freeways at East LA Interchange occupies former residential land

No other neighborhood in LA was more devastated by freeway construction. Thousands of homes demolished. Commercial corridors severed. The freeways didn't connect Boyle Heights—they isolated it.

**Today**: Boyle Heights remains lower-income with poor air quality from freeway pollution. The neighborhood that freeways destroyed is now zoned to prevent the density that once existed.`,
    peakDevelopment: 1940,
    keyRegulations: ['Freeway Construction (101, 5, 10, 60)', 'Downzoning', 'Redlining'],
    whatWasLost: 'Diverse immigrant neighborhood, commercial corridors, transit connections, thousands of homes',
    ifReformed: 'Could add ~8,200 units, reconnect severed neighborhoods'
  },

  '90042': {
    name: 'Highland Park',
    era: '1895-1940s',
    story: `Highland Park was LA's first suburb, connected by the city's first electric streetcar line (1895). The neighborhood developed organically around transit—dense, walkable, mixed-use blocks within walking distance of stations.

**The Transit Story:**
- **1895**: LA's first electric streetcar runs down Figueroa to Highland Park
- **1901**: Pacific Electric incorporates the line into its network
- **1902**: Streetcar extended to Pasadena via the Arroyo Seco
- **1920s**: York Boulevard commercial corridor thrives with streetcar access
- **1951**: Highland Park-Glendale Red Car line ends
- **1955**: All remaining streetcar service to the area ends

The streetcar created Highland Park's urban form: commercial buildings along the rail corridor, apartments and bungalow courts within walking distance, residential neighborhoods stepping down in density further from stations.

**What Changed After Transit:**
- **1940s**: Car-centric planning begins
- **1956**: Downzoning to single-family on most residential land
- **2010s**: Gentrification without new housing supply

**Today**: The Gold Line (2003) restored rail service to Highland Park along the old PE right-of-way. But most of the area is now zoned R1—the transit-oriented density can't be replicated.`,
    peakDevelopment: 1925,
    keyRegulations: ['Streetcar Removal (1951-55)', 'R1 Downzoning (1956)', 'Parking Minimums', 'CEQA'],
    whatWasLost: 'Streetcar-era density, affordable housing, organic transit-oriented development',
    ifReformed: 'Could add ~6,800 units along York and Figueroa'
  },

  // === SOUTH LA ===
  '90001': {
    name: 'Florence',
    era: '1920s-1950s',
    story: `Florence developed as a working-class African American neighborhood when restrictive covenants excluded Black residents from most of LA. Dense development provided housing.

**What Changed:**
- **1920s-1950s**: Apartments and small homes built for excluded communities
- **1956**: Downzoning reduced allowed density
- **1965**: Watts Rebellion followed by disinvestment
- **Today**: Zoning prevents rebuilding at historic density

**The Equity Issue**: South LA's zoning restricts housing in the communities that need it most, while protecting wealthy hillside areas from any development.`,
    peakDevelopment: 1955,
    keyRegulations: ['R1 Downzoning', 'Parking Minimums', 'Disinvestment'],
    whatWasLost: 'Affordable housing, community wealth-building',
    ifReformed: 'Could add ~8,200 units, enable community investment'
  },

  '90003': {
    name: 'South Central',
    era: '1920s-1960s',
    story: `South Central was a thriving working-class community, with dense housing and commercial corridors. The neighborhood was transformed by both freeway construction and deliberate disinvestment.

**Central Avenue - Before:**
Central Avenue was the "Harlem of the West"—jazz clubs, theaters, hotels, and dense commercial life. The African American community built this corridor when restrictive covenants excluded them from most of LA.

**The Freeway Impact:**
- **1961**: Santa Monica Freeway (I-10) cuts through the northern edge of the neighborhood
- **1960s**: Harbor Freeway (I-110) runs along the western edge
- **Route Selection**: Freeways were deliberately routed through Black and working-class neighborhoods—"path of least resistance" meant communities with less political power

The freeways didn't just take land—they severed connections between blocks, destroyed commercial frontage, and created noise/pollution barriers. Central Avenue's foot traffic disappeared.

**What Changed:**
- **1920s-1960s**: Dense development along Central Avenue, streetcar access
- **1961**: I-10 freeway bisects neighborhoods to the north
- **1965+**: Disinvestment, redlining, commercial decline
- **Today**: Zoning prevents the density needed for economic revival

**Today**: Central Avenue still exists, but the urban fabric that supported its commercial vitality was destroyed. Rebuilding that density is illegal under current zoning.`,
    peakDevelopment: 1948,
    keyRegulations: ['Freeway Construction (I-10, I-110)', 'Downzoning', 'Redlining', 'Disinvestment'],
    whatWasLost: 'Central Avenue corridor, community commercial districts, neighborhood connectivity',
    ifReformed: 'Could add ~9,500 units, rebuild commercial corridors'
  },

  // === SAN FERNANDO VALLEY ===
  '91601': {
    name: 'North Hollywood',
    era: '1910s-1960s',
    story: `North Hollywood developed around the Pacific Electric railway, with dense commercial districts and apartments near stations. The area's original urban form was created by transit.

**The Transit Story:**
- **1911**: Pacific Electric extends Red Car service to North Hollywood (originally "Lankershim")
- **1915**: PE builds the Hollywood Subway tunnel to speed Valley connections
- **1920s-1940s**: Dense commercial districts develop around stations on Lankershim and Magnolia
- **1952**: PE converts Valley lines to bus service
- **1955**: Remaining Red Car service ends

The streetcar created North Hollywood's walkable core: apartment buildings, commercial blocks, and bungalow courts concentrated near stations. Density decreased with distance from the line.

**What Changed After Transit:**
- **1960s**: Valley-wide downzoning for suburban development
- **2000s**: NoHo Arts District allowed selective upzoning around Metro station

**The NoHo Exception**: The Arts District proves density works in the Valley—walkable, transit-rich, economically vibrant. But it required special zoning that overrode Valley-wide restrictions. The rest of NoHo remains locked at suburban density despite excellent Metro access.`,
    peakDevelopment: 1955,
    keyRegulations: ['Streetcar Removal (1952-55)', 'Valley Downzoning (1960s)', 'Parking Minimums', 'R1 Restrictions'],
    whatWasLost: 'Streetcar-era density, transit-oriented development, Valley urbanism',
    ifReformed: 'Could add ~11,500 units near Metro stations'
  },

  '91403': {
    name: 'Sherman Oaks',
    era: '1920s-1960s',
    story: `Sherman Oaks was developed as an upscale Valley suburb, with larger lots and strict single-family zoning. Ventura Boulevard's commercial strip is the exception.

**What Changed:**
- **1927**: Developed as exclusive subdivision
- **1940s-60s**: Ventura Boulevard commercial built
- **Today**: R1 zoning prevents any multi-family except on Ventura

**Ventura Boulevard**: The commercial corridor could support thousands of apartments above shops. But parking requirements and height limits prevent mixed-use development.`,
    peakDevelopment: 1965,
    keyRegulations: ['R1 Zoning', 'Parking Minimums', 'Height Limits'],
    whatWasLost: 'Mixed-use on Ventura, housing diversity',
    ifReformed: 'Could add ~7,200 units along Ventura corridor'
  },

  '91316': {
    name: 'Encino',
    era: '1930s-1960s',
    story: `Encino developed as a ranch-style suburb, with large lots backing up to the Santa Monica Mountains. The area epitomizes Valley single-family exclusivity.

**What Changed:**
- **1930s**: Ranch development on large lots
- **1940s-60s**: Ventura Boulevard commercial developed
- **Today**: 78% R1 zoning prevents densification

**The Question**: Is Encino's character worth the cost? Protecting ranch homes means workers commute from Palmdale. The trade-off is regional.`,
    peakDevelopment: 1965,
    keyRegulations: ['R1 Zoning', 'Hillside Restrictions', 'Large Lot Minimums'],
    whatWasLost: 'Housing diversity, workforce housing',
    ifReformed: 'Could add ~5,800 units with gentle density'
  },

  // === HARBOR ===
  '90731': {
    name: 'San Pedro',
    era: '1900s-1950s',
    story: `San Pedro developed as a working port town with dense housing for dockworkers. The hillside neighborhoods have views and character built before modern restrictions.

**What Changed:**
- **1900s-1940s**: Dense worker housing near port
- **1956**: Downzoning to R1 on hillsides
- **1970s**: Port expansion prioritized over residential

**Port Town Charm**: San Pedro's walkable downtown and hillside neighborhoods were built for workers. Today's zoning prevents building affordable housing for port employees.`,
    peakDevelopment: 1948,
    keyRegulations: ['Downzoning', 'Hillside Ordinance', 'Port Priority'],
    whatWasLost: 'Worker housing, hillside apartments',
    ifReformed: 'Could add ~6,200 units near port employment'
  },
};

  // === ADDITIONAL NARRATIVES ===
  '90069': {
    name: 'West Hollywood',
    era: '1920s-1980s',
    story: `West Hollywood incorporated as its own city in 1984 largely to escape LA's zoning restrictions. Before that, the unincorporated "Sunset Strip" area developed with apartments, clubs, and density.

**What Changed:**
- **1920s-1984**: Unincorporated LA County—looser rules allowed apartments and entertainment venues
- **1984**: City incorporated with rent control and LGBT protections
- **Today**: WeHo has higher density than surrounding LA because of its history

**The Lesson**: West Hollywood's vitality exists because it escaped LA's downzoning. The Sunset Strip could never have developed under LA's rules.`,
    peakDevelopment: 1975,
    keyRegulations: ['County Rules (looser)', 'Post-incorporation limits'],
    whatWasLost: 'Some redevelopment potential after incorporation',
    ifReformed: 'Already denser than most LA—could add ~3,200 units'
  },

  '90038': {
    name: 'Hollywood',
    era: '1910s-1950s',
    story: `Hollywood was its own city until 1910, then developed as LA's entertainment capital. Studios, apartments for workers, and mixed-use buildings filled the area.

**What Changed:**
- **1910-1930s**: Studios and worker housing built together
- **1920s-40s**: Hollywood Boulevard became a glamorous commercial strip
- **1956**: Downzoning removed multi-family options
- **1986**: Hollywood Community Plan reduced allowed density

**The Boulevard's Decline**: Hollywood Boulevard went from premiere movie palaces to tourist traps. The cause: density limits prevented the residential population needed to support real retail.`,
    peakDevelopment: 1945,
    keyRegulations: ['Downzoning (1956)', 'Community Plan caps', 'Parking Minimums'],
    whatWasLost: 'Mixed-use vitality, housing near studios',
    ifReformed: 'Could add ~9,800 units, revive the Boulevard'
  },

  '90019': {
    name: 'Mid-City',
    era: '1920s-1950s',
    story: `Mid-City developed as a middle-class neighborhood with a mix of single-family homes and small apartments. The Pico-Robertson area became a Jewish community center.

**What Changed:**
- **1920s-1950s**: Mix of housing types built
- **1956**: Half the area downzoned to R1
- **Today**: Community character maintained but no new housing allowed

**The Affordability Trap**: Mid-City's older apartments are affordable because they're old. Zoning prevents building new affordable units, so when old buildings are demolished, affordable housing disappears permanently.`,
    peakDevelopment: 1948,
    keyRegulations: ['Partial Downzoning', 'Parking Minimums', 'Density Caps'],
    whatWasLost: 'Naturally affordable housing, small apartments',
    ifReformed: 'Could add ~6,400 units while preserving character'
  },

  '90016': {
    name: 'West Adams',
    era: '1890s-1940s',
    story: `West Adams was LA's first wealthy suburb in the 1890s, with grand Victorian homes along Adams Boulevard. After restrictive covenants were struck down (1948), the neighborhood transitioned to middle-class African American families.

**What Changed:**
- **1890s-1920s**: Grand homes for wealthy Angelenos
- **1948+**: Racial transition, subdivision of large lots
- **1956**: Downzoning locked in current density
- **2010s**: Gentrification without new housing supply

**The Adams Boulevard Mansions**: Many of LA's most beautiful Victorian homes exist here because they were built before zoning. Some have been subdivided into apartments—which is now illegal to do.`,
    peakDevelopment: 1920,
    keyRegulations: ['Historic Preservation (HPOZ)', 'R1 Zoning', 'Parking Minimums'],
    whatWasLost: 'Legal subdivision, rooming houses, gentle density',
    ifReformed: 'Could add ~5,200 units through ADUs and conversions'
  },

  '90004': {
    name: 'Los Feliz South / East Hollywood',
    era: '1910s-1940s',
    story: `The flatter portion of Los Feliz, extending into East Hollywood, developed with dingbat apartments and bungalow courts. This area shows what "missing middle" housing looked like before it was outlawed.

**What Changed:**
- **1910s-1940s**: Dingbats, fourplexes, courtyard housing built freely
- **1956**: Much of the area downzoned
- **Today**: Existing dingbats are "non-conforming"—legal but can't be replicated

**The Dingbat**: LA's iconic mid-century apartment building (ground-floor parking, 2-3 floors of units above) is now illegal in most of the city. The ones that exist are grandfathered.`,
    peakDevelopment: 1955,
    keyRegulations: ['Downzoning', 'Parking Design Standards', 'Lot Coverage Limits'],
    whatWasLost: 'Dingbats, bungalow courts, affordable small apartments',
    ifReformed: 'Could add ~7,200 units by re-legalizing what exists'
  },

  '90057': {
    name: 'Westlake',
    era: '1900s-1970s',
    story: `Westlake (Macarthur Park area) was once an affluent neighborhood, then became a dense immigrant community. The area has some of LA's highest density because development predates restrictions.

**What Changed:**
- **1900s-1920s**: Wealthy residents near downtown
- **1950s-1970s**: Transition to immigrant community, apartments subdivided
- **1980s+**: Overcrowding but no legal way to add supply

**The Overcrowding Paradox**: Westlake is "too dense" according to critics, but the density is a response to housing scarcity. The area can't legally add housing, so existing units are subdivided illegally.`,
    peakDevelopment: 1960,
    keyRegulations: ['Density Caps', 'Parking Minimums', 'Building Codes'],
    whatWasLost: 'Legal density, quality housing construction',
    ifReformed: 'Could add ~8,500 legal units, reduce overcrowding'
  },

  '91604': {
    name: 'Studio City',
    era: '1920s-1960s',
    story: `Studio City got its name from Mack Sennett's studio (1927). The neighborhood developed as a Valley suburb with larger lots near the hills, apartments along Ventura Boulevard.

**What Changed:**
- **1927+**: Development around the studio
- **1960s**: Valley-wide downzoning
- **Today**: 68% R1, Ventura corridor underdeveloped

**The Ventura Boulevard Potential**: The commercial corridor has transit, shops, and demand. But parking requirements and height limits prevent the mixed-use development that would revitalize it.`,
    peakDevelopment: 1962,
    keyRegulations: ['Valley Downzoning', 'Hillside Restrictions', 'Parking Minimums'],
    whatWasLost: 'Ventura Boulevard density, studio worker housing',
    ifReformed: 'Could add ~5,800 units along Ventura'
  },

  '91401': {
    name: 'Van Nuys',
    era: '1910s-1970s',
    story: `Van Nuys was the Valley's first significant development (1911), designed around the Pacific Electric railway. The civic center and commercial district show pre-car urbanism.

**What Changed:**
- **1911**: Development begins around rail station
- **1920s-1960s**: Downtown Van Nuys thrives as Valley's center
- **1970s+**: Suburban sprawl, civic decline
- **Today**: Metro Orange Line provides transit, but zoning prevents TOD

**The Lost Downtown**: Van Nuys has a traditional downtown grid that could support urban density. But zoning requires parking minimums and limits heights, preventing transit-oriented development.`,
    peakDevelopment: 1965,
    keyRegulations: ['Parking Minimums', 'Height Limits', 'Use Restrictions'],
    whatWasLost: 'Downtown vitality, transit-oriented development',
    ifReformed: 'Could add ~9,500 units near Metro stations'
  },

  '90007': {
    name: 'USC / Exposition Park',
    era: '1890s-1950s',
    story: `The area around USC developed with student housing, worker apartments, and institutional uses. The university's growth created constant housing demand.

**What Changed:**
- **1880s**: USC founded
- **1900s-1950s**: Student boarding houses, apartments, rooming houses
- **1980s+**: USC expansion pushes out housing
- **Today**: Severe student housing shortage

**The University Problem**: USC students need housing, but zoning prevents building it nearby. Students compete with families for existing units, driving up rents. The solution—more housing—is illegal.`,
    peakDevelopment: 1950,
    keyRegulations: ['Institutional Zoning', 'Parking Minimums', 'Community Opposition'],
    whatWasLost: 'Student housing, rooming houses, affordable apartments',
    ifReformed: 'Could add ~12,000 student housing units'
  },

  '90035': {
    name: 'Carthay',
    era: '1920s-1940s',
    story: `Carthay was a master-planned community (1922) with Spanish Colonial architecture, the historic Carthay Circle Theatre, and walkable streets.

**What Changed:**
- **1922**: Carthay Center development begins
- **1926**: Carthay Circle Theatre opens (demolished 1969)
- **1969**: Theatre demolished for office building
- **Today**: HPOZ restricts changes to preserve remaining character

**The Theatre's Fate**: LA's most beautiful movie palace was demolished for a bland office building. Historic preservation came too late. Now the HPOZ prevents both demolition AND new construction.`,
    peakDevelopment: 1940,
    keyRegulations: ['HPOZ', 'R1 Zoning', 'Parking Minimums'],
    whatWasLost: 'Carthay Circle Theatre, ability to add housing in historic style',
    ifReformed: 'Could add ~2,800 units with compatible design'
  },

  '90008': {
    name: 'Baldwin Hills / Crenshaw',
    era: '1920s-1960s',
    story: `Baldwin Hills developed as an affluent African American community after WWII—one of the few areas where Black families could buy homes. Crenshaw Boulevard became a thriving commercial corridor.

**What Changed:**
- **1920s-1940s**: Oil fields, then residential development
- **1950s-1960s**: Middle-class Black community established
- **1992**: Civil unrest, disinvestment
- **Today**: Gentrification pressure without new housing supply

**Crenshaw Corridor**: The commercial corridor could support dense, mixed-use development—especially near the new Metro line. But zoning prevents it, pushing development pressure onto existing residents.`,
    peakDevelopment: 1965,
    keyRegulations: ['R1 Zoning', 'Hillside Restrictions', 'Parking Minimums'],
    whatWasLost: 'Commercial corridor density, community wealth-building',
    ifReformed: 'Could add ~7,800 units along Crenshaw, near Metro'
  },

// Generate narrative for zipcodes without detailed story
export function getZipcodeNarrative(zipcode, data) {
  if (ZIPCODE_NARRATIVES[zipcode]) {
    return ZIPCODE_NARRATIVES[zipcode];
  }

  // Generate a basic narrative from the data
  const r1Pct = (data.r1Pct * 100).toFixed(0);
  const isHillside = data.isHillside;
  const totalAcres = data.totalAcres;

  let story = '';
  let keyRegulations = [];
  let whatWasLost = '';
  let ifReformed = '';

  if (data.r1Pct > 0.7) {
    story = `This ${isHillside ? 'hillside ' : ''}neighborhood is ${r1Pct}% single-family zoning—one of the most restricted areas in LA. Most development occurred before modern zoning locked in low density.`;
    keyRegulations = ['R1 Zoning', 'Parking Minimums'];
    if (isHillside) keyRegulations.push('Hillside Ordinance');
    whatWasLost = 'Housing diversity, multi-family options';
    ifReformed = `Could add ~${Math.round(totalAcres * data.r1Pct * 3.5).toLocaleString()} units through gentle density`;
  } else if (data.r1Pct > 0.4) {
    story = `A mixed neighborhood with ${r1Pct}% single-family zoning. Some multi-family exists from pre-downzoning era, but most land is restricted to single-family only.`;
    keyRegulations = ['R1 Zoning', 'Parking Minimums', 'Density Caps'];
    whatWasLost = 'Additional multi-family, mixed-use development';
    ifReformed = `Could add ~${Math.round(totalAcres * data.r1Pct * 3.5).toLocaleString()} units`;
  } else {
    story = `One of LA's denser areas with only ${r1Pct}% single-family zoning. This density exists because development occurred before modern restrictions. New buildings face parking requirements and CEQA delays.`;
    keyRegulations = ['Parking Minimums', 'Height Limits', 'CEQA'];
    whatWasLost = 'Faster development, more affordable units';
    ifReformed = `Could add ~${Math.round(totalAcres * 0.2 * 10).toLocaleString()} units with streamlined approvals`;
  }

  return {
    name: data.name || 'LA Area',
    era: 'Various',
    story,
    peakDevelopment: data.r1Pct > 0.5 ? 1955 : 1965,
    keyRegulations,
    whatWasLost,
    ifReformed
  };
}

// Get historical development potential for a year
export function getHistoricalPotential(year, data) {
  // Calculate what could have been built under that year's regulations
  let multiplier = 1.0;

  if (year < 1921) {
    // Pre-comprehensive zoning: minimal restrictions
    multiplier = 3.0;
  } else if (year < 1946) {
    // Early zoning but no specific plans
    multiplier = 2.2;
  } else if (year < 1956) {
    // Before major downzoning
    multiplier = 1.8;
  } else if (year < 1970) {
    // Post-downzoning but pre-CEQA
    multiplier = 1.4;
  } else if (year < 1986) {
    // CEQA but before density reductions
    multiplier = 1.2;
  } else if (year < 2011) {
    // Modern era pre-hillside ordinance
    multiplier = 1.1;
  } else {
    // Current regulations
    multiplier = 1.0;
  }

  return multiplier;
}

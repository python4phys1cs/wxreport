/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Metadata contract for a meteorological station.
 */
export interface StationMetadata {
  /** WMO 5-digit station code or AWS ID (e.g. "42937") */
  readonly id: string;
  /** Observatory display name */
  readonly name: string;
  /** 2-digit meteorological subdivision ID (e.g. "26") */
  readonly subdivisionId: string;
  /** Full subdivision name (e.g. "Vidarbha") */
  readonly subdivisionName: string;
  /** District name (where explicitly documented in legacy source) */
  readonly district?: string;
  /** Known legacy discrepancies across PHP files */
  readonly legacyNotes?: string;
}

/**
 * Metadata contract for a meteorological subdivision.
 */
export interface SubdivisionMetadata {
  /** 2-digit subdivision ID */
  readonly id: string;
  /** Subdivision display name */
  readonly name: string;
  /** Short subdivision code from ingestion script */
  readonly code: string;
  /** Canonical station IDs in default report order (web observation report) */
  readonly stationIds: readonly string[];
}

/**
 * Documented legacy inconsistencies across PHP source files.
 */
export const LEGACY_STATION_INCONSISTENCIES = {
  STATION_42715:
    'Station 42715 is included in observations_include_fast.php (East MP) and synop_entry_03utc.php $arr_station, but omitted in opfast_stations_for, orfast_stations_for, and orpfast_stations_for.',
  STATION_13301:
    'Station 13301 is included in observations_include_fast.php (Vidarbha) and observations_report_include_fast.php, but omitted in observations_print_include_fast.php (opfast_stations_for) and observations_report_print_include_fast.php (orpfast_stations_for).',
  VIDARBHA_PRINT_ORDER:
    'Vidarbha stations in web views begin with 42933 (Akola), whereas observations_report_print_include_fast.php (orpfast_stations_for) begins with 42867 (Amravati) and reorders the list.',
} as const;

/**
 * Special Vidarbha station ordering used strictly in `observations_report_print_include_fast.php` (orpfast_stations_for):
 */
export const VIDARBHA_PRINT_REPORT_ORDER: readonly string[] = Object.freeze([
  '42867', '42939', '42946', '42871', '43029',
  '42947', '42937', '42933', '42943', '42931', '42935'
]);

/**
 * Authoritative Allowlist for the four operational subdivisions:
 * Vidarbha (12), West Madhya Pradesh (18), East Madhya Pradesh (15), and Chhattisgarh (8).
 * Total allowlisted stations: 53.
 */
export const AUTHORITATIVE_STATION_ALLOWLIST: readonly string[] = Object.freeze([
  // Vidarbha (12)
  '42933', '42937', '42865', '42931', '42946', '43029', '42947', '42871', '42867', '42939', '42935', '42943',
  // West Madhya Pradesh (18)
  '42860', '42667', '42460', '42752', '42559', '42361', '42763', '42754', '42855', '42849', '42767', '42672', '42557', '42661', '42665', '42456', '42459', '42662',
  // East Madhya Pradesh (15)
  '42768', '42674', '42675', '42567', '42776', '42770', '42467', '42574', '42671', '42571', '42771', '42577', '42562', '42679', '42715',
  // Chhattisgarh (8)
  '42693', '42782', '42876', '43041', '42872', '42779', '42874', '42948',
]);

const ALLOWLIST_SET = new Set<string>(AUTHORITATIVE_STATION_ALLOWLIST);

/**
 * Checks if a 5-digit station code matches the authoritative allowlist.
 */
export function isAllowlistedStation(stationId: string): boolean {
  if (!stationId || typeof stationId !== 'string') return false;
  return ALLOWLIST_SET.has(stationId.trim());
}

/**
 * All 77 canonical stations across the 7 meteorological subdivisions
 * covered by RMC Nagpur's AMSS ingestion and reporting system.
 */
export const CANONICAL_STATIONS: readonly StationMetadata[] = Object.freeze([
  // ==========================================
  // Subdivision 19: West Madhya Pradesh (18 stations)
  // Source: observations_include_fast.php & synop_entry_03utc.php
  // ==========================================
  { id: '42860', name: 'Betul', subdivisionId: '19', subdivisionName: 'West Madhya Pradesh', district: 'Betul' },
  { id: '42667', name: 'Raisen', subdivisionId: '19', subdivisionName: 'West Madhya Pradesh', district: 'Raisen' },
  { id: '42460', name: 'Datia', subdivisionId: '19', subdivisionName: 'West Madhya Pradesh', district: 'Datia' },
  { id: '42752', name: 'Bhind', subdivisionId: '19', subdivisionName: 'West Madhya Pradesh', district: 'Bhind' },
  { id: '42559', name: 'Guna', subdivisionId: '19', subdivisionName: 'West Madhya Pradesh', district: 'Guna' },
  { id: '42361', name: 'Gwalior', subdivisionId: '19', subdivisionName: 'West Madhya Pradesh', district: 'Gwalior' },
  { id: '42763', name: 'Hoshangabad', subdivisionId: '19', subdivisionName: 'West Madhya Pradesh', district: 'Hoshangabad' },
  { id: '42754', name: 'Indore', subdivisionId: '19', subdivisionName: 'West Madhya Pradesh', district: 'Indore' },
  { id: '42855', name: 'Khandwa', subdivisionId: '19', subdivisionName: 'West Madhya Pradesh', district: 'Khandwa' },
  { id: '42849', name: 'Morena', subdivisionId: '19', subdivisionName: 'West Madhya Pradesh', district: 'Morena' },
  { id: '42767', name: 'Neemuch', subdivisionId: '19', subdivisionName: 'West Madhya Pradesh', district: 'Neemuch' },
  { id: '42672', name: 'Bhopal', subdivisionId: '19', subdivisionName: 'West Madhya Pradesh', district: 'Bhopal' },
  { id: '42557', name: 'Rajgarh', subdivisionId: '19', subdivisionName: 'West Madhya Pradesh', district: 'Rajgarh' },
  { id: '42661', name: 'Shajapur', subdivisionId: '19', subdivisionName: 'West Madhya Pradesh', district: 'Shajapur' },
  { id: '42665', name: 'Ashoknagar', subdivisionId: '19', subdivisionName: 'West Madhya Pradesh', district: 'Ashoknagar' },
  { id: '42456', name: 'Sheopur', subdivisionId: '19', subdivisionName: 'West Madhya Pradesh', district: 'Sheopur' },
  { id: '42459', name: 'Shivpuri', subdivisionId: '19', subdivisionName: 'West Madhya Pradesh', district: 'Shivpuri' },
  { id: '42662', name: 'Ujjain', subdivisionId: '19', subdivisionName: 'West Madhya Pradesh', district: 'Ujjain' },

  // ==========================================
  // Subdivision 20: East Madhya Pradesh (15 stations)
  // Source: observations_include_fast.php & synop_entry_03utc.php
  // ==========================================
  { id: '42768', name: 'Chhindwara', subdivisionId: '20', subdivisionName: 'East Madhya Pradesh', district: 'Chhindwara' },
  { id: '42674', name: 'Damoh', subdivisionId: '20', subdivisionName: 'East Madhya Pradesh', district: 'Damoh' },
  { id: '42675', name: 'Seoni', subdivisionId: '20', subdivisionName: 'East Madhya Pradesh', district: 'Seoni' },
  { id: '42567', name: 'Khajuraho', subdivisionId: '20', subdivisionName: 'East Madhya Pradesh', district: 'Chhatarpur' },
  { id: '42776', name: 'Mandla', subdivisionId: '20', subdivisionName: 'East Madhya Pradesh', district: 'Mandla' },
  { id: '42770', name: 'Narsinghpur', subdivisionId: '20', subdivisionName: 'East Madhya Pradesh', district: 'Narsinghpur' },
  { id: '42467', name: 'Nowgong', subdivisionId: '20', subdivisionName: 'East Madhya Pradesh', district: 'Chhatarpur' },
  { id: '42574', name: 'Rewa', subdivisionId: '20', subdivisionName: 'East Madhya Pradesh', district: 'Rewa' },
  { id: '42671', name: 'Sagar', subdivisionId: '20', subdivisionName: 'East Madhya Pradesh', district: 'Sagar' },
  { id: '42571', name: 'Satna', subdivisionId: '20', subdivisionName: 'East Madhya Pradesh', district: 'Satna' },
  { id: '42771', name: 'Jabalpur', subdivisionId: '20', subdivisionName: 'East Madhya Pradesh', district: 'Jabalpur' },
  { id: '42577', name: 'Sidhi', subdivisionId: '20', subdivisionName: 'East Madhya Pradesh', district: 'Sidhi' },
  { id: '42562', name: 'Tikamgarh', subdivisionId: '20', subdivisionName: 'East Madhya Pradesh', district: 'Tikamgarh' },
  { id: '42679', name: 'Umaria', subdivisionId: '20', subdivisionName: 'East Madhya Pradesh', district: 'Umaria' },
  {
    id: '42715',
    name: 'Malanjkhand',
    subdivisionId: '20',
    subdivisionName: 'East Madhya Pradesh',
    district: 'Balaghat',
    legacyNotes: LEGACY_STATION_INCONSISTENCIES.STATION_42715,
  },

  // ==========================================
  // Subdivision 26: Vidarbha (12 stations)
  // Source: observations_include_fast.php & synop_entry_03utc.php
  // ==========================================
  { id: '42933', name: 'Akola', subdivisionId: '26', subdivisionName: 'Vidarbha', district: 'Akola' },
  { id: '42937', name: 'Nagpur', subdivisionId: '26', subdivisionName: 'Vidarbha', district: 'Nagpur' },
  { id: '42865', name: 'Bhandara', subdivisionId: '26', subdivisionName: 'Vidarbha', district: 'Bhandara' },
  { id: '42931', name: 'Buldhana', subdivisionId: '26', subdivisionName: 'Vidarbha', district: 'Buldhana' },
  { id: '42946', name: 'Brahmapuri', subdivisionId: '26', subdivisionName: 'Vidarbha', district: 'Chandrapur' },
  { id: '43029', name: 'Chandrapur', subdivisionId: '26', subdivisionName: 'Vidarbha', district: 'Chandrapur' },
  { id: '42947', name: 'Gadchiroli', subdivisionId: '26', subdivisionName: 'Vidarbha', district: 'Gadchiroli' },
  { id: '42871', name: 'Gondia', subdivisionId: '26', subdivisionName: 'Vidarbha', district: 'Gondia' },
  { id: '42867', name: 'Amravati', subdivisionId: '26', subdivisionName: 'Vidarbha', district: 'Amravati' },
  { id: '42939', name: 'Wardha', subdivisionId: '26', subdivisionName: 'Vidarbha', district: 'Wardha' },
  { id: '42935', name: 'Washim', subdivisionId: '26', subdivisionName: 'Vidarbha', district: 'Washim' },
  { id: '42943', name: 'Yavatmal', subdivisionId: '26', subdivisionName: 'Vidarbha', district: 'Yavatmal' },

  // ==========================================
  // Subdivision 27: Chattisgarh (8 stations)
  // Source: observations_include_fast.php & synop_entry_03utc.php
  // ==========================================
  { id: '42693', name: 'Ambikapur', subdivisionId: '27', subdivisionName: 'Chattisgarh', district: 'Surguja' },
  { id: '42782', name: 'Bilaspur', subdivisionId: '27', subdivisionName: 'Chattisgarh', district: 'Bilaspur' },
  { id: '42876', name: 'Durg', subdivisionId: '27', subdivisionName: 'Chattisgarh', district: 'Durg' },
  { id: '43041', name: 'Jagdalpur', subdivisionId: '27', subdivisionName: 'Chattisgarh', district: 'Bastar' },
  { id: '42872', name: 'Raipur (Mana)', subdivisionId: '27', subdivisionName: 'Chattisgarh', district: 'Raipur' },
  { id: '42779', name: 'Pendra Road', subdivisionId: '27', subdivisionName: 'Chattisgarh', district: 'Bilaspur' },
  { id: '42874', name: 'Raipur', subdivisionId: '27', subdivisionName: 'Chattisgarh', district: 'Raipur' },
  { id: '42948', name: 'Rajnandgaon', subdivisionId: '27', subdivisionName: 'Chattisgarh', district: 'Rajnandgaon' },

  // ==========================================
  // Subdivision 25: Marathwada (6 stations)
  // Source: synop_entry_03utc.php line 66
  // ==========================================
  { id: '43014', name: 'Aurangabad', subdivisionId: '25', subdivisionName: 'Marathwada', district: 'Aurangabad' },
  { id: '43011', name: 'Parbhani', subdivisionId: '25', subdivisionName: 'Marathwada', district: 'Parbhani' },
  { id: '43021', name: 'Nanded', subdivisionId: '25', subdivisionName: 'Marathwada', district: 'Nanded' },
  { id: '43075', name: 'Beed', subdivisionId: '25', subdivisionName: 'Marathwada', district: 'Beed' },
  { id: '43017', name: 'Jalna', subdivisionId: '25', subdivisionName: 'Marathwada', district: 'Jalna' },
  { id: '43076', name: 'Osmanabad', subdivisionId: '25', subdivisionName: 'Marathwada', district: 'Osmanabad' },

  // ==========================================
  // Subdivision 24: Madhya Maharashtra (11 stations)
  // Source: synop_entry_03utc.php line 67
  // ==========================================
  { id: '43009', name: 'Pune', subdivisionId: '24', subdivisionName: 'Madhya Maharashtra', district: 'Pune' },
  { id: '42851', name: 'Jalgaon', subdivisionId: '24', subdivisionName: 'Madhya Maharashtra', district: 'Jalgaon' },
  { id: '43071', name: 'Mahabaleshwar', subdivisionId: '24', subdivisionName: 'Madhya Maharashtra', district: 'Satara' },
  { id: '43157', name: 'Solapur', subdivisionId: '24', subdivisionName: 'Madhya Maharashtra', district: 'Solapur' },
  { id: '43111', name: 'Satara', subdivisionId: '24', subdivisionName: 'Madhya Maharashtra', district: 'Satara' },
  { id: '42925', name: 'Nashik', subdivisionId: '24', subdivisionName: 'Madhya Maharashtra', district: 'Nashik' },
  { id: '42921', name: 'Malegaon', subdivisionId: '24', subdivisionName: 'Madhya Maharashtra', district: 'Nashik' },
  { id: '43063', name: 'Ahmednagar', subdivisionId: '24', subdivisionName: 'Madhya Maharashtra', district: 'Ahmednagar' },
  { id: '43158', name: 'Jeur', subdivisionId: '24', subdivisionName: 'Madhya Maharashtra', district: 'Solapur' },
  { id: '43113', name: 'Kolhapur', subdivisionId: '24', subdivisionName: 'Madhya Maharashtra', district: 'Kolhapur' },
  { id: '43117', name: 'Sangli', subdivisionId: '24', subdivisionName: 'Madhya Maharashtra', district: 'Sangli' },

  // ==========================================
  // Subdivision 23: Konkan & Goa (7 stations)
  // Source: synop_entry_03utc.php line 68
  // ==========================================
  { id: '43058', name: 'Alibag', subdivisionId: '23', subdivisionName: 'Konkan & Goa', district: 'Raigad' },
  { id: '43062', name: 'Ratnagiri', subdivisionId: '23', subdivisionName: 'Konkan & Goa', district: 'Ratnagiri' },
  { id: '43001', name: 'Dahanu', subdivisionId: '23', subdivisionName: 'Konkan & Goa', district: 'Palghar' },
  { id: '43109', name: 'Mormugao', subdivisionId: '23', subdivisionName: 'Konkan & Goa', district: 'South Goa' },
  { id: '43057', name: 'Mumbai (Santacruz)', subdivisionId: '23', subdivisionName: 'Konkan & Goa', district: 'Mumbai Suburban' },
  { id: '43003', name: 'Mumbai (Colaba)', subdivisionId: '23', subdivisionName: 'Konkan & Goa', district: 'Mumbai City' },
  { id: '43110', name: 'Panjim', subdivisionId: '23', subdivisionName: 'Konkan & Goa', district: 'North Goa' },
]);

/**
 * Pre-indexed map by station ID for O(1) lookup.
 */
const STATION_BY_ID = new Map<string, StationMetadata>(
  CANONICAL_STATIONS.map((stn) => [stn.id, stn])
);

/**
 * Official subdivisions metadata.
 */
export const SUBDIVISIONS: readonly SubdivisionMetadata[] = Object.freeze([
  {
    id: '19',
    name: 'West Madhya Pradesh',
    code: 'WMP',
    stationIds: Object.freeze([
      '42860', '42667', '42460', '42752', '42559', '42361',
      '42763', '42754', '42855', '42849', '42767', '42672',
      '42557', '42661', '42665', '42456', '42459', '42662'
    ]),
  },
  {
    id: '20',
    name: 'East Madhya Pradesh',
    code: 'EMP',
    stationIds: Object.freeze([
      '42768', '42674', '42675', '42567', '42776', '42770',
      '42467', '42574', '42671', '42571', '42771', '42577',
      '42562', '42679', '42715'
    ]),
  },
  {
    id: '26',
    name: 'Vidarbha',
    code: 'VID',
    stationIds: Object.freeze([
      '42933', '42937', '42865', '42931', '42946', '43029',
      '42947', '42871', '42867', '42939', '42935', '42943'
    ]),
  },
  {
    id: '27',
    name: 'Chattisgarh',
    code: 'CHT',
    stationIds: Object.freeze([
      '42693', '42782', '42876', '43041', '42872', '42779',
      '42874', '42948'
    ]),
  },
  {
    id: '25',
    name: 'Marathwada',
    code: 'MARATHWADA',
    stationIds: Object.freeze([
      '43014', '43011', '43021', '43075', '43017', '43076'
    ]),
  },
  {
    id: '24',
    name: 'Madhya Maharashtra',
    code: 'MADHYA_MAHA',
    stationIds: Object.freeze([
      '43009', '42851', '43071', '43157', '43111', '42925',
      '42921', '43063', '43158', '43113', '43117'
    ]),
  },
  {
    id: '23',
    name: 'Konkan & Goa',
    code: 'KONKAN_GOA',
    stationIds: Object.freeze([
      '43058', '43062', '43001', '43109', '43057', '43003',
      '43110'
    ]),
  },
]);

/**
 * Pre-indexed map by subdivision ID.
 */
const SUBDIVISION_BY_ID = new Map<string, SubdivisionMetadata>(
  SUBDIVISIONS.map((sub) => [sub.id, sub])
);

/**
 * Retrieves metadata for a station by its WMO ID.
 */
export function getStation(id: string): StationMetadata | undefined {
  return STATION_BY_ID.get(id);
}

/**
 * Retrieves metadata for an allowlisted station by its WMO ID.
 * Returns undefined for unknown or unallowlisted station codes.
 */
export function getAllowlistedStation(id: string): StationMetadata | undefined {
  if (!isAllowlistedStation(id)) return undefined;
  return STATION_BY_ID.get(id.trim());
}

/**
 * Retrieves all stations registered for a given subdivision ID.
 * Supports legacy report ordering variants (e.g. 'print' order for Vidarbha).
 */
export function getStationsBySubdivision(
  subdivisionId: string | number,
  orderVariant: 'web' | 'print' = 'web'
): readonly StationMetadata[] {
  const subId = String(subdivisionId);
  const sub = SUBDIVISION_BY_ID.get(subId);
  if (!sub) return [];

  // Special legacy handling for Vidarbha print report ordering
  if (subId === '26' && orderVariant === 'print') {
    return VIDARBHA_PRINT_REPORT_ORDER.map((id) => STATION_BY_ID.get(id)!).filter(Boolean);
  }

  return sub.stationIds.map((id) => STATION_BY_ID.get(id)!).filter(Boolean);
}

/**
 * Returns all canonical stations.
 */
export function getAllStations(): readonly StationMetadata[] {
  return CANONICAL_STATIONS;
}

/**
 * Returns all registered subdivisions.
 */
export function getAllSubdivisions(): readonly SubdivisionMetadata[] {
  return SUBDIVISIONS;
}

/**
 * Retrieves subdivision metadata by its ID.
 */
export function getSubdivision(id: string | number): SubdivisionMetadata | undefined {
  return SUBDIVISION_BY_ID.get(String(id));
}

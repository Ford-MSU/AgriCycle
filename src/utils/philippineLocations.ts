import { Location } from '../types';

export interface LocationOption {
  code: string;
  name: string;
}

export interface PhilippineHierarchySelection {
  region: string;
  province: string;
  city: string;
  barangay: string;
}

export interface PSGCValidationResult {
  status: 'VERIFIED' | 'INCOMPLETE' | 'MISMATCH' | 'UNLISTED';
  message: string;
}

const REGION_ALIAS_MAP: Record<string, string> = {
  'region i': 'Ilocos Region (Region I)',
  'ilocos region': 'Ilocos Region (Region I)',
  'region ii': 'Cagayan Valley (Region II)',
  'cagayan valley': 'Cagayan Valley (Region II)',
  'region iii': 'Central Luzon (Region III)',
  'central luzon': 'Central Luzon (Region III)',
  'region iv-a': 'CALABARZON (Region IV-A)',
  calabarzon: 'CALABARZON (Region IV-A)',
  'mimaropa region': 'MIMAROPA Region',
  mimaropa: 'MIMAROPA Region',
  'region v': 'Bicol Region (Region V)',
  'bicol region': 'Bicol Region (Region V)',
  'region vi': 'Western Visayas (Region VI)',
  'western visayas': 'Western Visayas (Region VI)',
  'region vii': 'Central Visayas (Region VII)',
  'central visayas': 'Central Visayas (Region VII)',
  'region viii': 'Eastern Visayas (Region VIII)',
  'eastern visayas': 'Eastern Visayas (Region VIII)',
  'region ix': 'Zamboanga Peninsula (Region IX)',
  'zamboanga peninsula': 'Zamboanga Peninsula (Region IX)',
  'region x': 'Northern Mindanao (Region X)',
  'northern mindanao': 'Northern Mindanao (Region X)',
  'region xi': 'Davao Region (Region XI)',
  'davao region': 'Davao Region (Region XI)',
  'region xii': 'SOCCSKSARGEN (Region XII)',
  soccsksargen: 'SOCCSKSARGEN (Region XII)',
  'region xiii': 'Caraga Region',
  caraga: 'Caraga Region',
  'caraga region': 'Caraga Region',
  'region xiii (caraga)': 'Caraga Region',
  'caraga (region xiii)': 'Caraga Region',
  'national capital region': 'National Capital Region (NCR)',
  ncr: 'National Capital Region (NCR)',
  'national capital region (ncr)': 'National Capital Region (NCR)',
  'cordillera administrative region': 'Cordillera Administrative Region (CAR)',
  car: 'Cordillera Administrative Region (CAR)',
  'cordillera administrative region (car)': 'Cordillera Administrative Region (CAR)',
  'bangsamoro autonomous region in muslim mindanao': 'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)',
  barmm: 'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)',
  'bangsamoro autonomous region in muslim mindanao (barmm)': 'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)',
  'negros island region': 'Negros Island Region (NIR)',
  nir: 'Negros Island Region (NIR)',
  'negros island region (nir)': 'Negros Island Region (NIR)',
};

const PROVINCE_TO_REGION_FALLBACK: Record<string, string> = {
  'agusan del norte': 'Caraga Region',
  'agusan del sur': 'Caraga Region',
  'dinagat islands': 'Caraga Region',
  'surigao del norte': 'Caraga Region',
  'surigao del sur': 'Caraga Region',
  'misamis oriental': 'Northern Mindanao (Region X)',
  'misamis occidental': 'Northern Mindanao (Region X)',
  bukidnon: 'Northern Mindanao (Region X)',
  camiguin: 'Northern Mindanao (Region X)',
  'lanao del norte': 'Northern Mindanao (Region X)',
};

export function normalizeLocationPart(value?: string | null): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

export function normalizeRegionName(value?: string | null): string {
  const clean = normalizeLocationPart(value);
  if (!clean) return '';
  const mapped = REGION_ALIAS_MAP[clean.toLowerCase()];
  if (mapped) return mapped;
  return clean;
}

export function inferRegionFromProvince(province?: string | null): string {
  const clean = normalizeLocationPart(province).toLowerCase();
  return PROVINCE_TO_REGION_FALLBACK[clean] || '';
}

export function resolveLocationRegion(loc?: Partial<Location> | null): string {
  if (!loc) return '';
  if (loc.region && loc.region.trim()) {
    return normalizeRegionName(loc.region);
  }
  return inferRegionFromProvince(loc.province);
}

/**
 * Formats a Location using full Philippine administrative hierarchy:
 * Barangay, City/Municipality, Province, Region (never defaults missing values to Butuan City).
 */
export function formatLocationHierarchy(
  loc?: Partial<Location> | null,
  options: { includeRegion?: boolean; prefixBarangay?: boolean; fallback?: string } = {}
): string {
  const {
    includeRegion = true,
    prefixBarangay = true,
    fallback = 'Location not specified',
  } = options;

  if (!loc) return fallback;

  const barangay = normalizeLocationPart(loc.barangay);
  const city = normalizeLocationPart(loc.city);
  const province = normalizeLocationPart(loc.province);
  const region = includeRegion ? resolveLocationRegion(loc) : '';

  const parts: string[] = [];
  if (barangay) {
    parts.push(prefixBarangay && !/^brgy\.?/i.test(barangay) ? `Brgy. ${barangay}` : barangay);
  }
  if (city) parts.push(city);
  if (province) parts.push(province);
  if (region) parts.push(region);

  return parts.length > 0 ? parts.join(', ') : fallback;
}

export function formatShortLocation(loc?: Partial<Location> | null): string {
  return formatLocationHierarchy(loc, { includeRegion: false, prefixBarangay: true });
}

/**
 * Unique normalized administrative hierarchy key so identically named barangays
 * across different cities/provinces/regions are NEVER treated as identical.
 */
export function getLocationHierarchyKey(loc?: Partial<Location> | null): string {
  if (!loc) return '';
  const region = resolveLocationRegion(loc).toLowerCase();
  const province = normalizeLocationPart(loc.province).toLowerCase();
  const city = normalizeLocationPart(loc.city).toLowerCase();
  const barangay = normalizeLocationPart(loc.barangay).toLowerCase();
  return `${region}|${province}|${city}|${barangay}`;
}

export function isSameLocationHierarchy(
  a?: Partial<Location> | null,
  b?: Partial<Location> | null
): boolean {
  if (!a || !b) return false;
  const barangayA = normalizeLocationPart(a.barangay).toLowerCase();
  const barangayB = normalizeLocationPart(b.barangay).toLowerCase();
  const cityA = normalizeLocationPart(a.city).toLowerCase();
  const cityB = normalizeLocationPart(b.city).toLowerCase();
  const provA = normalizeLocationPart(a.province).toLowerCase();
  const provB = normalizeLocationPart(b.province).toLowerCase();

  if (!barangayA || !cityA || !provA) return false;
  if (barangayA !== barangayB || cityA !== cityB || provA !== provB) return false;

  const regA = resolveLocationRegion(a).toLowerCase();
  const regB = resolveLocationRegion(b).toLowerCase();
  // Match if both regions match, OR if one legacy record lacks region while province+city+barangay match
  return !regA || !regB || regA === regB;
}

export function isLocationHierarchyComplete(loc?: Partial<Location> | null): boolean {
  if (!loc) return false;
  return Boolean(
    resolveLocationRegion(loc) &&
      normalizeLocationPart(loc.province) &&
      normalizeLocationPart(loc.city) &&
      normalizeLocationPart(loc.barangay)
  );
}

// ============================================================================
// Official Philippine PSGC Reference Dataset Loader (Code-Split Lazy Import)
// Source package: @aivangogh/ph-address (18 Regions, 1,656 Cities/Municipalities,
// 42,010 Barangays — official PSA PSGC administrative hierarchy)
// ============================================================================

interface IndexedProvince {
  code: string;
  name: string;
  regionCode: string;
  cities: IndexedCity[];
}

interface IndexedCity {
  code: string;
  name: string;
  provinceCode: string;
}

interface IndexedRegion {
  code: string;
  canonicalName: string;
  rawName: string;
  designation: string;
  provinces: IndexedProvince[];
}

interface PSGCDatasetIndex {
  regions: IndexedRegion[];
  getBarangaysByCityCode: (cityCode: string) => LocationOption[];
}

let cachedIndexPromise: Promise<PSGCDatasetIndex> | null = null;

function toCanonicalRegionName(name: string, designation: string): string {
  const byName = REGION_ALIAS_MAP[name.toLowerCase()];
  if (byName) return byName;
  const byDesignation = REGION_ALIAS_MAP[designation.toLowerCase()];
  if (byDesignation) return byDesignation;
  return designation ? `${designation} (${name})` : name;
}

async function getPSGCIndex(): Promise<PSGCDatasetIndex> {
  if (!cachedIndexPromise) {
    cachedIndexPromise = (async () => {
      const mod = await import('@aivangogh/ph-address');

      const rawRegions = mod.getAllRegions();
      const rawProvinces = mod.getAllProvinces();
      const rawMunicipalities = mod.getAllMunicipalities();

      const provincesByCode = new Map<string, IndexedProvince>();

      rawProvinces.forEach((p) => {
        provincesByCode.set(p.psgcCode, {
          code: p.psgcCode,
          name: p.name,
          regionCode: p.regionCode,
          cities: [],
        });
      });

      // Handle Philippine administrative units without traditional provinces in PSGC
      // so all 1,656 LGUs remain cleanly navigable via Region -> Province -> City/Mun -> Barangay
      const specialProvinceGroups: Array<{ code: string; name: string; regionCode: string }> = [
        { code: '1300000000', name: 'Metro Manila (NCR)', regionCode: '1300000000' },
        { code: '1380600000', name: 'City of Manila (Districts)', regionCode: '1300000000' },
        { code: '0990100000', name: 'Isabela City (Special HUC)', regionCode: '0900000000' },
        { code: '1999900000', name: 'Special Geographic Area (SGA-BARMM)', regionCode: '1900000000' },
      ];

      specialProvinceGroups.forEach((sp) => {
        if (!provincesByCode.has(sp.code)) {
          provincesByCode.set(sp.code, {
            code: sp.code,
            name: sp.name,
            regionCode: sp.regionCode,
            cities: [],
          });
        }
      });

      rawMunicipalities.forEach((m) => {
        const prov = provincesByCode.get(m.provinceCode);
        if (prov) {
          prov.cities.push({
            code: m.psgcCode,
            name: m.name,
            provinceCode: m.provinceCode,
          });
        }
      });

      provincesByCode.forEach((prov) => {
        prov.cities.sort((a, b) => a.name.localeCompare(b.name));
      });

      const regions: IndexedRegion[] = rawRegions.map((r) => {
        const provs = Array.from(provincesByCode.values())
          .filter((p) => p.regionCode === r.psgcCode && p.cities.length > 0)
          .sort((a, b) => a.name.localeCompare(b.name));

        return {
          code: r.psgcCode,
          canonicalName: toCanonicalRegionName(r.name, r.designation),
          rawName: r.name,
          designation: r.designation,
          provinces: provs,
        };
      });

      return {
        regions,
        getBarangaysByCityCode: (cityCode: string): LocationOption[] =>
          mod.getBarangaysByMunicipality(cityCode).map((b) => ({
            code: b.psgcCode,
            name: b.name,
          })),
      };
    })();
  }
  return cachedIndexPromise;
}

export async function getPhilippineRegions(): Promise<LocationOption[]> {
  const index = await getPSGCIndex();
  return index.regions.map((r) => ({ code: r.code, name: r.canonicalName }));
}

export async function getProvincesByRegionName(regionName: string): Promise<LocationOption[]> {
  const norm = normalizeRegionName(regionName).toLowerCase();
  if (!norm) return [];
  const index = await getPSGCIndex();
  const region = index.regions.find(
    (r) =>
      r.canonicalName.toLowerCase() === norm ||
      r.rawName.toLowerCase() === norm ||
      r.designation.toLowerCase() === norm
  );
  if (!region) return [];
  return region.provinces.map((p) => ({ code: p.code, name: p.name }));
}

export async function getCitiesByProvinceName(
  regionName: string,
  provinceName: string
): Promise<LocationOption[]> {
  const normRegion = normalizeRegionName(regionName).toLowerCase();
  const normProv = normalizeLocationPart(provinceName).toLowerCase();
  if (!normRegion || !normProv) return [];

  const index = await getPSGCIndex();
  const region = index.regions.find(
    (r) =>
      r.canonicalName.toLowerCase() === normRegion ||
      r.rawName.toLowerCase() === normRegion ||
      r.designation.toLowerCase() === normRegion
  );
  if (!region) return [];

  const province = region.provinces.find((p) => p.name.toLowerCase() === normProv);
  if (!province) return [];

  return province.cities.map((c) => ({ code: c.code, name: c.name }));
}

export async function getBarangaysByCityName(
  regionName: string,
  provinceName: string,
  cityName: string
): Promise<LocationOption[]> {
  const normRegion = normalizeRegionName(regionName).toLowerCase();
  const normProv = normalizeLocationPart(provinceName).toLowerCase();
  const normCity = normalizeLocationPart(cityName).toLowerCase();
  if (!normRegion || !normProv || !normCity) return [];

  const index = await getPSGCIndex();
  const region = index.regions.find(
    (r) =>
      r.canonicalName.toLowerCase() === normRegion ||
      r.rawName.toLowerCase() === normRegion ||
      r.designation.toLowerCase() === normRegion
  );
  if (!region) return [];

  const province = region.provinces.find((p) => p.name.toLowerCase() === normProv);
  if (!province) return [];

  const city = province.cities.find((c) => c.name.toLowerCase() === normCity);
  if (!city) return [];

  return index.getBarangaysByCityCode(city.code);
}

/**
 * Verifies whether a location record's Region -> Province -> City/Municipality -> Barangay
 * hierarchy is complete and matches the official Philippine PSGC dataset.
 * Used as a decision-support indicator for Coordinator validation ONLY (never auto-validates).
 */
export async function verifyLocationHierarchyAgainstPSGC(
  loc?: Partial<Location> | null
): Promise<PSGCValidationResult> {
  if (!loc) {
    return {
      status: 'INCOMPLETE',
      message: 'No source location record is attached to this submission.',
    };
  }

  const region = resolveLocationRegion(loc);
  const province = normalizeLocationPart(loc.province);
  const city = normalizeLocationPart(loc.city);
  const barangay = normalizeLocationPart(loc.barangay);

  if (!region || !province || !city || !barangay) {
    const missing: string[] = [];
    if (!region) missing.push('Region');
    if (!province) missing.push('Province');
    if (!city) missing.push('City/Municipality');
    if (!barangay) missing.push('Barangay');
    return {
      status: 'INCOMPLETE',
      message: `Incomplete location hierarchy (missing: ${missing.join(', ')}). Coordinator may return this record for correction.`,
    };
  }

  try {
    const provinces = await getProvincesByRegionName(region);
    const matchedProvince = provinces.find((p) => p.name.toLowerCase() === province.toLowerCase());
    if (!matchedProvince) {
      return {
        status: 'MISMATCH',
        message: `Province "${province}" was not found under "${region}" in the PSGC reference dataset.`,
      };
    }

    const cities = await getCitiesByProvinceName(region, matchedProvince.name);
    const matchedCity = cities.find((c) => c.name.toLowerCase() === city.toLowerCase());
    if (!matchedCity) {
      return {
        status: 'MISMATCH',
        message: `City/Municipality "${city}" was not found under "${matchedProvince.name}, ${region}" in the PSGC reference dataset.`,
      };
    }

    const barangays = await getBarangaysByCityName(region, matchedProvince.name, matchedCity.name);
    const matchedBarangay = barangays.find((b) => b.name.toLowerCase() === barangay.toLowerCase());
    if (!matchedBarangay) {
      return {
        status: 'UNLISTED',
        message: `Barangay "${barangay}" was not found under "${matchedCity.name}, ${matchedProvince.name}". Verify spelling or return for correction if incorrect.`,
      };
    }

    return {
      status: 'VERIFIED',
      message: `Verified PSGC hierarchy (${matchedBarangay.name} → ${matchedCity.name} → ${matchedProvince.name} → ${region}).`,
    };
  } catch {
    return {
      status: 'UNLISTED',
      message: 'PSGC reference check unavailable offline; verify administrative hierarchy manually.',
    };
  }
}

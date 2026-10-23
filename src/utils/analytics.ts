import { BiomassRecord, RecordStatus, ReferenceData, Location, BiomassSource } from '../types';

export interface StandardizedMetricSummary {
  totalRecordsCount: number;
  totalVolumeTonnes: number;
  availableVolumeTonnes: number;
  usedOrCommittedVolumeTonnes: number;
  pendingValidationCount: number;
  validatedCount: number;
  staleCount: number;
}

export interface CategoryBreakdownItem {
  typeId: string;
  categoryName: string;
  recordCount: number;
  totalQuantityKg: number;
  totalQuantityTonnes: number;
  availableQuantityTonnes: number;
}

export interface BarangayRankingItem {
  barangay: string;
  recordCount: number;
  totalVolumeTonnes: number;
  availableVolumeTonnes: number;
}

/**
 * Converts a quantity from its stored reference unit to Metric Tonnes (t).
 * Standard base conversion:
 * - 1 MT / t = 1 t
 * - 1 KG = 0.001 t
 * - 1 Bag (50kg) = 0.05 t
 * - 1 Truckload (assumed average 5 metric tonnes if not specified) = 5 t
 */
export function convertToMetricTonnes(
  quantity: number,
  unitIdOrCode: string,
  referenceData: ReferenceData[] = []
): number {
  if (!quantity || isNaN(quantity) || quantity <= 0) return 0;

  const unitRef = referenceData.find(
    (r) => r.id === unitIdOrCode || r.code === unitIdOrCode || r.label.toLowerCase().includes(unitIdOrCode.toLowerCase())
  );

  const code = (unitRef?.code || unitIdOrCode).toUpperCase();

  if (code === 'MT' || code.includes('TON') || code.includes('METRIC')) {
    return quantity;
  }
  if (code === 'KG' || code.includes('KILO')) {
    return quantity / 1000;
  }
  if (code.includes('BAG') || code === 'BAGS_50KG') {
    return (quantity * 50) / 1000;
  }
  if (code.includes('TRUCK')) {
    return quantity * 5; // standard 5 tonnes truckload estimate
  }

  // Fallback assuming kg if > 500, else tonnes
  return quantity >= 100 ? quantity / 1000 : quantity;
}

/**
 * Calculates standardized core metrics across any given dataset of BiomassRecords
 */
export function calculateCoreMetrics(
  records: BiomassRecord[],
  referenceData: ReferenceData[] = []
): StandardizedMetricSummary {
  let totalVolumeTonnes = 0;
  let availableVolumeTonnes = 0;
  let usedOrCommittedVolumeTonnes = 0;
  let pendingValidationCount = 0;
  let validatedCount = 0;
  let staleCount = 0;

  records.forEach((record) => {
    const totalTonnes = convertToMetricTonnes(record.quantity, record.originalUnit, referenceData);
    
    // Remaining quantity or fallback
    const remainingTonnes = record.remainingQuantity !== undefined
      ? convertToMetricTonnes(record.remainingQuantity, record.originalUnit, referenceData)
      : totalTonnes;

    const usedOrReservedTonnes = Math.max(0, totalTonnes - remainingTonnes);

    totalVolumeTonnes += totalTonnes;
    usedOrCommittedVolumeTonnes += usedOrReservedTonnes;

    if (record.status === RecordStatus.VALIDATED) {
      validatedCount++;
      availableVolumeTonnes += remainingTonnes;
    } else if (
      record.status === RecordStatus.SUBMITTED ||
      record.status === RecordStatus.UNDER_REVIEW
    ) {
      pendingValidationCount++;
    } else if (record.status === RecordStatus.STALE) {
      staleCount++;
    }
  });

  return {
    totalRecordsCount: records.length,
    totalVolumeTonnes: Math.round(totalVolumeTonnes * 10) / 10,
    availableVolumeTonnes: Math.round(availableVolumeTonnes * 10) / 10,
    usedOrCommittedVolumeTonnes: Math.round(usedOrCommittedVolumeTonnes * 10) / 10,
    pendingValidationCount,
    validatedCount,
    staleCount,
  };
}

/**
 * Computes category breakdown
 */
export function calculateCategoryBreakdown(
  records: BiomassRecord[],
  referenceData: ReferenceData[] = []
): CategoryBreakdownItem[] {
  const map = new Map<string, CategoryBreakdownItem>();

  records.forEach((r) => {
    const typeLabel =
      referenceData.find((ref) => ref.id === r.biomassTypeId)?.label || 'Uncategorized';
    const tonnes = convertToMetricTonnes(r.quantity, r.originalUnit, referenceData);
    const availTonnes = r.remainingQuantity !== undefined
      ? convertToMetricTonnes(r.remainingQuantity, r.originalUnit, referenceData)
      : tonnes;

    if (!map.has(r.biomassTypeId)) {
      map.set(r.biomassTypeId, {
        typeId: r.biomassTypeId,
        categoryName: typeLabel,
        recordCount: 0,
        totalQuantityKg: 0,
        totalQuantityTonnes: 0,
        availableQuantityTonnes: 0,
      });
    }

    const item = map.get(r.biomassTypeId)!;
    item.recordCount++;
    item.totalQuantityTonnes += tonnes;
    item.totalQuantityKg += tonnes * 1000;
    if (r.status === RecordStatus.VALIDATED) {
      item.availableQuantityTonnes += availTonnes;
    }
  });

  return Array.from(map.values())
    .map((item) => ({
      ...item,
      totalQuantityTonnes: Math.round(item.totalQuantityTonnes * 10) / 10,
      availableQuantityTonnes: Math.round(item.availableQuantityTonnes * 10) / 10,
    }))
    .sort((a, b) => b.totalQuantityTonnes - a.totalQuantityTonnes);
}

/**
 * Computes barangay rankings
 */
export function calculateBarangayRankings(
  records: BiomassRecord[],
  locations: Location[],
  sources: BiomassSource[],
  referenceData: ReferenceData[] = []
): BarangayRankingItem[] {
  const map = new Map<string, BarangayRankingItem>();

  records.forEach((r) => {
    const src = sources.find((s) => s.id === r.sourceId);
    const locId = src?.locationId || r.locationId;
    const loc = locations.find((l) => l.id === locId);
    const barangay = loc?.barangay || 'Other / Regional';

    const tonnes = convertToMetricTonnes(r.quantity, r.originalUnit, referenceData);
    const availTonnes = r.remainingQuantity !== undefined
      ? convertToMetricTonnes(r.remainingQuantity, r.originalUnit, referenceData)
      : tonnes;

    if (!map.has(barangay)) {
      map.set(barangay, {
        barangay,
        recordCount: 0,
        totalVolumeTonnes: 0,
        availableVolumeTonnes: 0,
      });
    }

    const item = map.get(barangay)!;
    item.recordCount++;
    item.totalVolumeTonnes += tonnes;
    if (r.status === RecordStatus.VALIDATED) {
      item.availableVolumeTonnes += availTonnes;
    }
  });

  return Array.from(map.values())
    .map((item) => ({
      ...item,
      totalVolumeTonnes: Math.round(item.totalVolumeTonnes * 10) / 10,
      availableVolumeTonnes: Math.round(item.availableVolumeTonnes * 10) / 10,
    }))
    .sort((a, b) => b.totalVolumeTonnes - a.totalVolumeTonnes);
}

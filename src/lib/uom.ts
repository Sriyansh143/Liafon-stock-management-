/**
 * Unit of Measure (UOM) conversion helpers.
 *
 * SparePart has:
 *   - baseUom:                  Stock is tracked in this unit (usually "PCS")
 *   - purchaseUom:              Supplier delivers in this unit (e.g. "BOX" of 10)
 *   - purchaseToBaseConversion: How many base units per purchase unit
 *   - sellingUom:               Default for sales (usually same as baseUom)
 *   - sellingToBaseConversion:  How many base units per selling unit
 *
 * When a Purchase is recorded with quantity=2 BOX (conversion=10):
 *   → stock += 2 × 10 = 20 PCS
 *
 * When a Sale is recorded with quantity=3 PCS:
 *   → stock -= 3 (base units)
 *
 * The conversion factors allow shops to buy in bulk (per box) but sell per
 * piece, without manual multiplication.
 */

// Common UOMs used in Indian retail (auto-parts focus)
export const COMMON_UOMS = [
  { code: 'PCS', name: 'Piece', symbol: 'pcs' },
  { code: 'BOX', name: 'Box', symbol: 'box' },
  { code: 'PKT', name: 'Packet', symbol: 'pkt' },
  { code: 'SET', name: 'Set', symbol: 'set' },
  { code: 'PAIR', name: 'Pair', symbol: 'pair' },
  { code: 'KG', name: 'Kilogram', symbol: 'kg' },
  { code: 'GM', name: 'Gram', symbol: 'g' },
  { code: 'LTR', name: 'Litre', symbol: 'L' },
  { code: 'ML', name: 'Millilitre', symbol: 'mL' },
  { code: 'MTR', name: 'Metre', symbol: 'm' },
  { code: 'CM', name: 'Centimetre', symbol: 'cm' },
  { code: 'ROLL', name: 'Roll', symbol: 'roll' },
  { code: 'BAG', name: 'Bag', symbol: 'bag' },
  { code: 'DRM', name: 'Drum', symbol: 'drum' },
  { code: 'DOZEN', name: 'Dozen (12)', symbol: 'dz' },
  { code: 'GROSS', name: 'Gross (144)', symbol: 'gr' },
  { code: 'NOS', name: 'Numbers', symbol: 'nos' },
  { code: 'UNIT', name: 'Unit', symbol: 'unit' },
] as const

/** Lookup a UOM name from its code. */
export function getUomName(code: string): string {
  return COMMON_UOMS.find((u) => u.code === code)?.name ?? code
}

/** Convert a quantity from one UOM to the base UOM. */
export function convertToBase(
  quantity: number,
  fromUom: string,
  conversionFactor: number
): number {
  // If the source UOM is the base UOM, no conversion needed.
  if (conversionFactor === 0 || conversionFactor === 1) return quantity
  return Math.round(quantity * conversionFactor * 1000) / 1000   // round to 3 dp
}

/** Convert from base to another UOM (the inverse of convertToBase). */
export function convertFromBase(
  baseQuantity: number,
  toUom: string,
  conversionFactor: number
): number {
  if (conversionFactor === 0 || conversionFactor === 1) return baseQuantity
  return Math.round((baseQuantity / conversionFactor) * 1000) / 1000
}

/**
 * Compute the total cost when buying in a non-base UOM.
 * If you buy 2 BOX (conversion=10, unit cost ₹100/box), the per-piece cost is:
 *   unitCost / conversion = 100 / 10 = ₹10/piece
 */
export function computePerPieceCost(unitCost: number, conversionFactor: number): number {
  if (conversionFactor === 0) return unitCost
  return unitCost / conversionFactor
}

/**
 * Validate a UOM conversion factor.
 * Must be > 0. Most are integers (1, 5, 10, 12, 144) but we allow decimals
 * for non-uniform conversions (e.g. buying 1 LTR = 0.831 KG for hydraulic oil).
 */
export function isValidConversion(factor: number): boolean {
  return Number.isFinite(factor) && factor > 0
}

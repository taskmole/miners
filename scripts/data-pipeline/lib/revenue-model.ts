/**
 * Revenue Prediction Model
 *
 * Implements the Miners franchise evaluation spreadsheet as code.
 * Four-block financial chain: Traffic -> Orders -> Revenue -> EBITDA.
 * All constants are per-market and overridable per listing.
 *
 * KEEP IN SYNC with src/lib/revenue-model.ts (the client-side copy used by
 * the revenue simulator in NewListingsModal). A cross-package re-export
 * isn't possible here because this pipeline project's tsconfig `rootDir`
 * rejects imports from outside scripts/data-pipeline. If these two files
 * drift, prefer src/lib/revenue-model.ts as the source of truth.
 */

// ===========================================
// TYPES
// ===========================================

export interface MarketDefaults {
  captureRate: number;      // % of foot traffic that buys (e.g. 0.02 = 2%)
  avgTicket: number;        // average spend per order in local currency
  vatRate: number;          // VAT % (e.g. 0.15 = 15%)
  cogsRate: number;         // cost of goods sold as % of net revenue
  baristaWageRate: number;  // barista wages as % of net revenue
  managementCost: number;   // fixed monthly management cost
  labourTaxRate: number;    // tax on wages as multiplier of barista wages (e.g. 0.33)
  royaltyRate: number;      // franchise royalty as % of net revenue
  overheadRate: number;     // accounting + other as % of net revenue
  ratesRate: number;        // rates/utilities as % of net revenue
  buildoutPerSqm: number;   // construction cost per sqm
  fixedEquipment: number;   // fixed equipment + furniture cost
  bufferMultiplier: number; // budget buffer (e.g. 1.145 = 14.5%)
  currency: string;         // 'EUR' | 'CZK'
}

export interface RevenueEstimate {
  monthlyRevenue: number;
  monthlyEbitda: number;
  paybackMonths: number | null;
  totalInvestment: number;
  confidence: 'estimated' | 'measured' | 'user';
  inputs: {
    dailyTraffic: number;
    captureRate: number;
    avgTicket: number;
    monthlyRent: number;
    sizeSqm: number;
  };
}

// ===========================================
// MARKET DEFAULTS
// ===========================================

/**
 * EUR defaults from the Miners franchise spreadsheet (Stage 1)
 */
const EUR_DEFAULTS: MarketDefaults = {
  captureRate: 0.02,
  avgTicket: 5.5,
  vatRate: 0.15,
  cogsRate: 0.34,
  baristaWageRate: 0.21,
  managementCost: 600,
  labourTaxRate: 0.33,
  royaltyRate: 0.07,
  overheadRate: 0.04,       // accounting 2% + other 2%
  ratesRate: 0.05,
  buildoutPerSqm: 385,
  fixedEquipment: 149000,
  bufferMultiplier: 1.145,
  currency: 'EUR',
};

/**
 * CZK defaults from the Czech PNL sheet
 */
const CZK_DEFAULTS: MarketDefaults = {
  captureRate: 0.02,
  avgTicket: 130,
  vatRate: 0.118,
  cogsRate: 0.34,
  baristaWageRate: 0.19,
  managementCost: 10000,
  labourTaxRate: 0.25,
  royaltyRate: 0.09,
  overheadRate: 0.02,
  ratesRate: 0.05,
  buildoutPerSqm: 385,     // placeholder, adjust for CZK
  fixedEquipment: 149000,   // placeholder
  bufferMultiplier: 1.145,
  currency: 'CZK',
};

// ===========================================
// GETTER FUNCTIONS
// ===========================================

/**
 * Get market defaults for a given currency.
 * Returns a fresh copy so callers can override fields safely.
 */
export function getMarketDefaults(currency: string): MarketDefaults {
  if (currency === 'CZK') return { ...CZK_DEFAULTS };
  return { ...EUR_DEFAULTS };
}

// ===========================================
// REVENUE PREDICTION
// ===========================================

/**
 * Predict monthly revenue and payback for a cafe location.
 *
 * Implements the 4-block financial chain:
 *   Block 1: Traffic -> Orders
 *   Block 2: Orders -> Revenue
 *   Block 3: Revenue -> Operating Profit
 *   Block 4: Operating Profit -> EBITDA
 *
 * Returns null if any input is invalid (zero or negative).
 */
export function predictRevenue(
  dailyTraffic: number,
  monthlyRent: number,
  sizeSqm: number,
  defaults: MarketDefaults,
  confidence: 'estimated' | 'measured' | 'user' = 'estimated',
): RevenueEstimate | null {
  if (dailyTraffic <= 0 || monthlyRent <= 0 || sizeSqm <= 0) return null;

  const d = defaults;

  // Block 1: Traffic -> Orders
  const monthlyOrders = dailyTraffic * d.captureRate * 30;

  // Block 2: Orders -> Revenue
  const totalRevenue = monthlyOrders * d.avgTicket;
  const netRevenue = totalRevenue * (1 - d.vatRate);

  // Block 3: Revenue -> Operating Profit
  const cogs = netRevenue * d.cogsRate;
  const grossProfit = netRevenue - cogs;

  const baristaWages = netRevenue * d.baristaWageRate;
  const labourTax = baristaWages * d.labourTaxRate;
  const totalWages = baristaWages + d.managementCost + labourTax;
  const operatingProfit = grossProfit - totalWages;

  // Block 4: Operating Profit -> EBITDA
  const rates = netRevenue * d.ratesRate;
  const overheads = netRevenue * (d.royaltyRate + d.overheadRate);
  const ebitda = operatingProfit - monthlyRent - rates - overheads;

  // Investment calculation
  const constructionCost = sizeSqm * d.buildoutPerSqm;
  const totalInvestment = (constructionCost + d.fixedEquipment) * d.bufferMultiplier;

  // Payback (null if EBITDA is zero or negative)
  const paybackMonths = ebitda > 0 ? Math.ceil(totalInvestment / ebitda) : null;

  return {
    monthlyRevenue: Math.round(totalRevenue),
    monthlyEbitda: Math.round(ebitda),
    paybackMonths,
    totalInvestment: Math.round(totalInvestment),
    confidence,
    inputs: {
      dailyTraffic,
      captureRate: d.captureRate,
      avgTicket: d.avgTicket,
      monthlyRent,
      sizeSqm,
    },
  };
}

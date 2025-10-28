// Utility to compute pip size and convert pips to price range per instrument
// Defaults are conservative and can be overridden in env via config if needed.

export function pipSize(pair) {
  if (!pair) return 0.0001;
  const p = String(pair).toUpperCase();
  if (p.includes('JPY')) return 0.01; // JPY pairs
  if (p.includes('XAU')) return 0.1; // Gold: treat 1.0 = 10 pips; 0.1 per pip
  if (p.includes('XAG')) return 0.01; // Silver rough default
  return 0.0001; // Major FX pairs default
}

export function pipsToPrice(pair, pips) {
  const ps = pipSize(pair);
  return ps * pips;
}

export function priceWidthToPips(pair, priceWidth) {
  const ps = pipSize(pair);
  if (!ps) return 0;
  return priceWidth / ps;
}

/**
 * Validate zone size is within acceptable pip range
 * @param {string} pair - Trading pair (e.g., XAUUSD, EURUSD)
 * @param {number} zonePriceHigh - Upper price of zone
 * @param {number} zonePriceLow - Lower price of zone
 * @param {number} minPips - Minimum acceptable pips (default from config)
 * @param {number} maxPips - Maximum acceptable pips (default from config)
 * @returns {Object} { valid: boolean, actualPips: number, error?: string }
 */
export function validateZoneSize(pair, zonePriceHigh, zonePriceLow, minPips = 20, maxPips = 30) {
  if (!zonePriceHigh || !zonePriceLow || zonePriceHigh <= zonePriceLow) {
    return {
      valid: false,
      actualPips: 0,
      error: 'Invalid zone prices'
    };
  }

  const priceWidth = zonePriceHigh - zonePriceLow;
  const actualPips = priceWidthToPips(pair, priceWidth);

  if (actualPips < minPips) {
    return {
      valid: false,
      actualPips,
      error: `Zone too narrow: ${actualPips.toFixed(1)} pips (minimum: ${minPips} pips)`
    };
  }

  if (actualPips > maxPips) {
    return {
      valid: false,
      actualPips,
      error: `Zone too wide: ${actualPips.toFixed(1)} pips (maximum: ${maxPips} pips)`
    };
  }

  return {
    valid: true,
    actualPips
  };
}

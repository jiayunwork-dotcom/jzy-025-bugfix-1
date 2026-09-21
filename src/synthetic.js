// Deterministic synthetic series for the preset record and for tests.

/** mulberry32: small seeded PRNG, deterministic across runs and machines. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal samples via Box-Muller on a supplied uniform RNG. */
export function gaussianSeries(n, seed, sigma = 1) {
  const rand = mulberry32(seed);
  const out = new Array(n);
  for (let i = 0; i < n; i += 2) {
    const u1 = Math.max(rand(), Number.MIN_VALUE);
    const u2 = rand();
    const r = Math.sqrt(-2 * Math.log(u1)) * sigma;
    out[i] = r * Math.cos(2 * Math.PI * u2);
    if (i + 1 < n) out[i + 1] = r * Math.sin(2 * Math.PI * u2);
  }
  return out;
}

/** White frequency-modulation series: i.i.d. Gaussian fractional frequency. */
export function syntheticWhiteFm(n, seed, sigma = 1) {
  return gaussianSeries(n, seed, sigma);
}

export const PRESET_LABEL = 'preset:white-fm';
export const PRESET_POINTS = 32768;
export const PRESET_SEED = 20260919;
export const PRESET_TAU0 = 1;

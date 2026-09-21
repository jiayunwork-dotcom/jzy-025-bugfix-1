// Noise-type identification from local slopes on the log(tau) vs
// log(sigma_y) plot. The pinned slope intervals below are the single source
// of truth; they are stored verbatim into every computed record so a curve
// can always be re-interpreted against the exact bands that produced it.

export const NOISE_TYPES = Object.freeze({
  WHITE_PM: 'white_pm', // white phase modulation,   slope ~ -1
  WHITE_FM: 'white_fm', // white frequency modulation, slope ~ -1/2
  RANDOM_WALK_FM: 'random_walk_fm', // random-walk frequency, slope ~ +1/2
  UNKNOWN: 'unknown',
});

// [lower inclusive, upper inclusive] bands on the local log-log slope.
export const SLOPE_INTERVALS = Object.freeze({
  white_pm: Object.freeze([-1.25, -0.75]),
  white_fm: Object.freeze([-0.75, -0.25]),
  random_walk_fm: Object.freeze([0.25, 0.75]),
});

/**
 * Map one local slope to a noise type. Anything outside every pinned band
 * (including non-finite slopes) is reported as "unknown" — never force a fit.
 */
export function classifySlope(slope) {
  if (!Number.isFinite(slope)) return NOISE_TYPES.UNKNOWN;
  for (const [type, [lo, hi]] of Object.entries(SLOPE_INTERVALS)) {
    if (slope >= lo && slope <= hi) return type;
  }
  return NOISE_TYPES.UNKNOWN;
}

/**
 * Local slope of the log-log curve between points i and i+1.
 * Returns null when the slope is undefined (non-positive sigma on either
 * end, e.g. an all-zero record, or a degenerate tau step).
 */
export function localSlope(tauA, sigmaA, tauB, sigmaB) {
  if (!(sigmaA > 0) || !(sigmaB > 0) || !(tauA > 0) || !(tauB > 0) || tauA === tauB) {
    return null;
  }
  return (Math.log10(sigmaB) - Math.log10(sigmaA)) / (Math.log10(tauB) - Math.log10(tauA));
}

/**
 * Attach a noise type to every curve point. Point i takes the type of the
 * segment from i to i+1; the last point inherits the final segment's type.
 * With fewer than two points no slope exists at all, so the whole type
 * column stays empty (null), as specified.
 *
 * @param {number[]} taus
 * @param {number[]} sigmas
 * @returns {{ slopes: (number|null)[], types: (string|null)[] }}
 */
export function assignNoiseTypes(taus, sigmas) {
  const n = taus.length;
  if (n < 2) {
    return { slopes: new Array(n).fill(null), types: new Array(n).fill(null) };
  }
  const slopes = new Array(n).fill(null);
  const types = new Array(n).fill(null);
  for (let i = 0; i < n - 1; i++) {
    const slope = localSlope(taus[i], sigmas[i], taus[i + 1], sigmas[i + 1]);
    slopes[i] = slope;
    types[i] = classifySlope(slope);
  }
  types[n - 1] = types[n - 2];
  return { slopes, types };
}

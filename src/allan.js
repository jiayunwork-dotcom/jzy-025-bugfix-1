// Overlapping Allan deviation estimators.
//
// "Overlapping" here is a hard requirement, not a label: the analysis window
// of length tau = m*tau0 slides over the series with a stride of ONE sample,
// which is strictly smaller than the block length m, so consecutive blocks
// overlap. Every overlapping second difference (phase data) or difference of
// adjacent tau-averages (fractional-frequency data) enters the estimate.
//
// All functions are pure: every accumulation lives in a local variable, so
// nothing can leak from one record's computation into the next.

/**
 * Overlapping Allan deviation for phase-time (clock offset) data.
 *
 *   sigma_y^2(tau) = 1 / (2 (N - 2m) tau^2)
 *                    * sum_{i=0}^{N-2m-1} ( x[i+2m] - 2 x[i+m] + x[i] )^2
 *
 * @param {number[]} x phase-time samples, evenly spaced by tau0
 * @param {number} m   averaging factor (positive integer), tau = m * tau0
 * @param {number} tau0 sampling interval, must be > 0
 * @returns {number} sigma_y(tau)
 */
export function overlappingAllanDeviationPhase(x, m, tau0) {
  const n = x.length;
  const terms = n - 2 * m;
  if (!Number.isInteger(m) || m < 1 || terms < 1) {
    throw new RangeError(`need at least 2m+1 samples (n=${n}, m=${m})`);
  }
  const tau = m * tau0;
  let sum = 0; // local accumulator, discarded when the call returns
  for (let i = 0; i < terms; i++) {
    const secondDiff = x[i + 2 * m] - 2 * x[i + m] + x[i];
    sum += secondDiff * secondDiff;
  }
  return Math.sqrt(sum / (2 * terms * tau * tau));
}

/**
 * Overlapping Allan deviation for fractional-frequency data.
 *
 *   ybar_j(m) = (1/m) sum_{k=0}^{m-1} y[j+k]
 *   sigma_y^2(tau) = 1 / (2 (N - 2m + 1))
 *                    * sum_{j=0}^{N-2m} ( ybar_{j+m} - ybar_j )^2
 *
 * With y derived from phase x as y_i = (x[i+1] - x[i]) / tau0 this is
 * algebraically identical to the phase estimator above, so one physical
 * process sampled both ways yields the same sigma_y at the same physical tau.
 *
 * @param {number[]} y fractional-frequency samples
 * @param {number} m   averaging factor (positive integer)
 * @returns {number} sigma_y(m * tau0)
 */
export function overlappingAllanDeviationFrequency(y, m) {
  const n = y.length;
  const terms = n - 2 * m + 1;
  if (!Number.isInteger(m) || m < 1 || terms < 1) {
    throw new RangeError(`need at least 2m samples (n=${n}, m=${m})`);
  }
  // Prefix sums give each m-sample block average in O(1); the sliding window
  // still advances one sample at a time (stride 1 < m), i.e. overlapping.
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + y[i];
  let sum = 0; // local accumulator, discarded when the call returns
  for (let j = 0; j < terms; j++) {
    const avgA = (prefix[j + m] - prefix[j]) / m;
    const avgB = (prefix[j + 2 * m] - prefix[j + m]) / m;
    const diff = avgB - avgA;
    sum += diff * diff;
  }
  return Math.sqrt(sum / (2 * terms));
}

/**
 * Total record duration T for a series of n points.
 * Phase: n points span n-1 sampling intervals.
 * Frequency: n samples each cover one interval.
 */
export function recordDuration(kind, n, tau0) {
  const intervals = kind === 'phase' ? n - 1 : n;
  return intervals * tau0;
}

/**
 * Largest admissible m under the hard rule tau <= T/3.
 */
export function maxMForSeries(kind, n) {
  const intervals = kind === 'phase' ? n - 1 : n;
  return Math.floor(intervals / 3);
}

/**
 * Candidate averaging factors on a decade grid: 1, 2, 5 per decade
 * (1, 2, 5, 10, 20, 50, ...), truncated at maxM. tau = m * tau0.
 */
export function candidateMs(maxM) {
  const ms = [];
  for (let decade = 1; decade <= maxM; decade *= 10) {
    for (const digit of [1, 2, 5]) {
      const m = digit * decade;
      if (m <= maxM) ms.push(m);
    }
  }
  return ms.sort((a, b) => a - b);
}

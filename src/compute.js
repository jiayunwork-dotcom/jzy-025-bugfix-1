// Analysis pipeline: pick the decade tau grid under the tau <= T/3 rule,
// run the overlapping Allan estimator at each tau, then read local slopes
// on the log-log plot and tag noise types. Stateless by construction — a
// record's intermediate sums die inside the estimator calls, so nothing can
// contaminate the next record.

import {
  candidateMs,
  maxMForSeries,
  overlappingAllanDeviationFrequency,
  overlappingAllanDeviationPhase,
  recordDuration,
} from './allan.js';
import { NOISE_TYPES, SLOPE_INTERVALS, assignNoiseTypes } from './noise.js';

/**
 * @param {'phase'|'frequency'} kind
 * @param {number} tau0 positive sampling interval
 * @param {number[]} series finite samples, already length-checked
 * @returns analysis result; on failure only { status, reason } is set and
 *          no curve is produced — a failed record must never look complete.
 */
export function analyzeSeries(kind, tau0, series) {
  const n = series.length;
  const duration = recordDuration(kind, n, tau0);
  const maxM = maxMForSeries(kind, n);
  const ms = candidateMs(maxM);

  if (ms.length === 0) {
    return {
      status: 'failed',
      reason: `no candidate averaging time satisfies tau <= T/3 (T/3 = ${duration / 3})`,
    };
  }

  const sigmas = ms.map((m) =>
    kind === 'phase'
      ? overlappingAllanDeviationPhase(series, m, tau0)
      : overlappingAllanDeviationFrequency(series, m),
  );
  const taus = ms.map((m) => m * tau0);

  const { slopes, types } = assignNoiseTypes(taus, sigmas);

  const curve = ms.map((m, i) => ({
    m,
    tau: taus[i],
    sigmaY: sigmas[i],
    slope: slopes[i],
    noiseType: types[i],
  }));

  return {
    status: 'done',
    mList: ms,
    curve,
    slopeIntervals: SLOPE_INTERVALS,
    hasWhiteFM: types.includes(NOISE_TYPES.WHITE_FM),
  };
}

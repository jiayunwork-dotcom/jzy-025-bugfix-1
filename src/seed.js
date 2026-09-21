// Boot-time seeding of the pinned synthetic white-FM record. Its mid-range
// log-log slope sits at ~ -1/2 and its mid rows are tagged white_fm.

import { analyzeSeries } from './compute.js';
import { PRESET_LABEL, PRESET_POINTS, PRESET_SEED, PRESET_TAU0, syntheticWhiteFm } from './synthetic.js';

/**
 * Insert the preset record unless it already exists. Returns its id.
 */
export function seedPresetRecord(store) {
  if (store.hasLabel(PRESET_LABEL)) {
    return store.list().find((r) => r.label === PRESET_LABEL).id;
  }
  const series = syntheticWhiteFm(PRESET_POINTS, PRESET_SEED, 1);
  const result = analyzeSeries('frequency', PRESET_TAU0, series);
  if (result.status !== 'done') {
    throw new Error(`preset record failed to compute: ${result.reason}`);
  }
  return store.insert({
    label: PRESET_LABEL,
    kind: 'frequency',
    tau0: PRESET_TAU0,
    points: series.length,
    status: 'done',
    hasWhiteFM: result.hasWhiteFM,
    payload: {
      series,
      mList: result.mList,
      curve: result.curve,
      slopeIntervals: result.slopeIntervals,
    },
  });
}

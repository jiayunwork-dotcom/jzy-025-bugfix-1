import assert from 'node:assert/strict';
import test from 'node:test';
import { NOISE_TYPES, SLOPE_INTERVALS, assignNoiseTypes, classifySlope } from '../src/noise.js';

test('pinned slope intervals are the documented ones', () => {
  assert.deepEqual(SLOPE_INTERVALS.white_pm, [-1.25, -0.75]);
  assert.deepEqual(SLOPE_INTERVALS.white_fm, [-0.75, -0.25]);
  assert.deepEqual(SLOPE_INTERVALS.random_walk_fm, [0.25, 0.75]);
});

test('classifySlope maps the three canonical slopes and rejects the rest', () => {
  assert.equal(classifySlope(-1), NOISE_TYPES.WHITE_PM);
  assert.equal(classifySlope(-0.5), NOISE_TYPES.WHITE_FM);
  assert.equal(classifySlope(0.5), NOISE_TYPES.RANDOM_WALK_FM);
  assert.equal(classifySlope(-1.1), NOISE_TYPES.WHITE_PM);
  assert.equal(classifySlope(-0.3), NOISE_TYPES.WHITE_FM);
  assert.equal(classifySlope(0.4), NOISE_TYPES.RANDOM_WALK_FM);
  // outside every band -> unknown, never a forced label
  assert.equal(classifySlope(0), NOISE_TYPES.UNKNOWN);
  assert.equal(classifySlope(0.1), NOISE_TYPES.UNKNOWN);
  assert.equal(classifySlope(0.9), NOISE_TYPES.UNKNOWN);
  assert.equal(classifySlope(-1.4), NOISE_TYPES.UNKNOWN);
  assert.equal(classifySlope(Number.NaN), NOISE_TYPES.UNKNOWN);
  assert.equal(classifySlope(null), NOISE_TYPES.UNKNOWN);
  assert.equal(classifySlope(Number.POSITIVE_INFINITY), NOISE_TYPES.UNKNOWN);
});

test('assignNoiseTypes tags pure power laws end to end', () => {
  const taus = [1, 2, 5, 10, 20, 50, 100];
  const powerLaw = (mu) => taus.map((t) => t ** mu);
  assert.deepEqual(
    assignNoiseTypes(taus, powerLaw(-1)).types,
    taus.map(() => NOISE_TYPES.WHITE_PM),
  );
  assert.deepEqual(
    assignNoiseTypes(taus, powerLaw(-0.5)).types,
    taus.map(() => NOISE_TYPES.WHITE_FM),
  );
  assert.deepEqual(
    assignNoiseTypes(taus, powerLaw(0.5)).types,
    taus.map(() => NOISE_TYPES.RANDOM_WALK_FM),
  );
});

test('fewer than two points leaves the whole type column empty', () => {
  assert.deepEqual(assignNoiseTypes([], []).types, []);
  assert.deepEqual(assignNoiseTypes([1], [1e-3]).types, [null]);
  assert.deepEqual(assignNoiseTypes([1], [1e-3]).slopes, [null]);
});

test('zero sigma makes the segment unclassifiable, not a fake label', () => {
  const { types, slopes } = assignNoiseTypes([1, 2, 5], [0, 0, 0]);
  assert.deepEqual(slopes, [null, null, null]);
  assert.deepEqual(types, [NOISE_TYPES.UNKNOWN, NOISE_TYPES.UNKNOWN, NOISE_TYPES.UNKNOWN]);
});

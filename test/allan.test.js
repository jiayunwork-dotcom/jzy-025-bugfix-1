import assert from 'node:assert/strict';
import test from 'node:test';
import {
  candidateMs,
  maxMForSeries,
  overlappingAllanDeviationFrequency,
  overlappingAllanDeviationPhase,
  recordDuration,
} from '../src/allan.js';
import { analyzeSeries } from '../src/compute.js';
import { gaussianSeries } from '../src/synthetic.js';

test('frequency estimator: hand-computed values', () => {
  const y = [1, 2, 3, 4, 5];
  // m=1: four overlapping differences, each 1 -> var = 4/(2*4) = 0.5
  assert.equal(overlappingAllanDeviationFrequency(y, 1), Math.sqrt(0.5));
  // m=2: block averages 1.5, 2.5, 3.5, 4.5 -> two overlapping diffs of 2
  //        -> var = 8/(2*2) = 2
  assert.equal(overlappingAllanDeviationFrequency(y, 2), Math.sqrt(2));
});

test('phase estimator: hand-computed values', () => {
  // Linear phase has zero second difference everywhere.
  assert.equal(overlappingAllanDeviationPhase([0, 1, 2, 3, 4, 5], 1, 1), 0);
  // x = [0,0,1,0,0], m=1, tau0=1: second diffs 1, -2, 1 -> sum 6
  // var = 6/(2*3*1) = 1
  assert.equal(overlappingAllanDeviationPhase([0, 0, 1, 0, 0], 1, 1), 1);
  // tau0 scales sigma_y as 1/tau0 for the same phase series.
  const x = gaussianSeries(64, 7);
  const s1 = overlappingAllanDeviationPhase(x, 2, 1);
  const s2 = overlappingAllanDeviationPhase(x, 2, 2);
  assert.ok(Math.abs(s2 - s1 / 2) < 1e-15);
});

test('all-zero series gives exactly zero at every legal tau, both kinds', () => {
  const zeros = new Array(64).fill(0);
  for (const m of [1, 2, 5, 10, 20]) {
    assert.equal(overlappingAllanDeviationFrequency(zeros, m), 0);
    assert.equal(overlappingAllanDeviationPhase(zeros, m, 1), 0);
  }
  const result = analyzeSeries('frequency', 1, zeros);
  assert.equal(result.status, 'done');
  for (const row of result.curve) assert.equal(row.sigmaY, 0);
});

test('phase and frequency estimators agree on one physical process', () => {
  const tau0 = 0.5;
  const phase = gaussianSeries(500, 99);
  // cumulative sum to add a random-walk component, then derive frequency
  let acc = 0;
  const x = phase.map((v) => (acc += v));
  const y = [];
  for (let i = 0; i + 1 < x.length; i++) y.push((x[i + 1] - x[i]) / tau0);
  for (const m of [1, 2, 5, 10, 50]) {
    const fromPhase = overlappingAllanDeviationPhase(x, m, tau0);
    const fromFreq = overlappingAllanDeviationFrequency(y, m);
    assert.ok(
      Math.abs(fromPhase - fromFreq) <= 1e-12 * fromPhase,
      `m=${m}: ${fromPhase} vs ${fromFreq}`,
    );
  }
});

test('decade grid and T/3 rule', () => {
  assert.deepEqual(candidateMs(10), [1, 2, 5, 10]);
  assert.deepEqual(candidateMs(1365), [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]);
  assert.deepEqual(candidateMs(0), []);
  // phase: 31 points -> T = 30*tau0 -> maxM = 10
  assert.equal(maxMForSeries('phase', 31), 10);
  // frequency: 31 points -> T = 31*tau0 -> maxM = 10
  assert.equal(maxMForSeries('frequency', 31), 10);
  assert.equal(maxMForSeries('phase', 3), 0);
  assert.equal(recordDuration('phase', 31, 2), 60);
  assert.equal(recordDuration('frequency', 31, 2), 62);
});

test('record fails when every candidate tau exceeds T/3', () => {
  const result = analyzeSeries('phase', 1, [0, 1, 0]);
  assert.equal(result.status, 'failed');
  assert.match(result.reason, /T\/3/);
  assert.equal(result.curve, undefined);
});

test('estimators reject impossible m', () => {
  assert.throws(() => overlappingAllanDeviationFrequency([1, 2, 3], 2), RangeError);
  assert.throws(() => overlappingAllanDeviationPhase([1, 2, 3], 2, 1), RangeError);
});

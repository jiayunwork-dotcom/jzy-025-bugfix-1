import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';
import { seedPresetRecord } from '../src/seed.js';
import { RecordStore } from '../src/storage.js';
import { PRESET_LABEL, gaussianSeries, syntheticWhiteFm } from '../src/synthetic.js';

let server;
let store;
let base;

before(async () => {
  store = new RecordStore(':memory:');
  seedPresetRecord(store);
  const app = createApp(store);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  store.close();
});

async function postRecord(body) {
  const res = await fetch(`${base}/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { httpStatus: res.status, body: await res.json() };
}

async function getRecord(id) {
  const res = await fetch(`${base}/records/${id}`);
  return { httpStatus: res.status, body: await res.json() };
}

/**
 * Mid-range rows: away from the short-tau edge (m >= 5) and away from the
 * noisy long-tau tail (m <= points/100), where finite-sample wobble of the
 * local slope stays well inside the pinned noise bands.
 */
function midRows(record) {
  return record.curve.filter((r) => r.m >= 5 && r.m <= record.points / 100);
}

function assertMidSlopes(record, expectedSlope, expectedType) {
  const mid = midRows(record);
  assert.ok(mid.length >= 3, `enough mid rows, got ${mid.length}`);
  for (const row of mid) {
    assert.ok(
      Math.abs(row.slope - expectedSlope) <= 0.15,
      `mid slope at m=${row.m} is ${row.slope}, expected ~ ${expectedSlope}`,
    );
    assert.equal(row.noiseType, expectedType, `mid row m=${row.m}`);
  }
}

// --- preset record -------------------------------------------------------

test('preset white-FM record: mid slope ~ -1/2 and tagged white_fm', async () => {
  const list = await (await fetch(`${base}/records`)).json();
  const preset = list.find((r) => r.label === PRESET_LABEL);
  assert.ok(preset, 'preset record is listed');
  assert.equal(preset.hasWhiteFM, true);

  const { body } = await getRecord(preset.id);
  assert.equal(body.status, 'done');
  assertMidSlopes(body, -0.5, 'white_fm');
});

// --- noise-type regions ----------------------------------------------------

test('submitted white-FM series: mid-range local slopes near -1/2', async () => {
  const series = syntheticWhiteFm(4096, 424242, 1);
  const { body } = await postRecord({ kind: 'frequency', tau0: 1, series });
  assert.equal(body.status, 'done');
  const { body: record } = await getRecord(body.id);
  assertMidSlopes(record, -0.5, 'white_fm');
});

test('white phase noise reads slope ~ -1 and is tagged white_pm', async () => {
  const series = gaussianSeries(8192, 555, 1);
  const { body } = await postRecord({ kind: 'phase', tau0: 1, series });
  assert.equal(body.status, 'done');
  const { body: record } = await getRecord(body.id);
  assertMidSlopes(record, -1, 'white_pm');
});

test('random-walk frequency reads slope ~ +1/2 and is tagged random_walk_fm', async () => {
  let acc = 0;
  const series = gaussianSeries(8192, 666, 1).map((v) => (acc += v));
  const { body } = await postRecord({ kind: 'frequency', tau0: 1, series });
  assert.equal(body.status, 'done');
  const { body: record } = await getRecord(body.id);
  assertMidSlopes(record, 0.5, 'random_walk_fm');
});

// --- amplitude doubling ---------------------------------------------------

test('doubling white-FM amplitude doubles sigma_y and keeps the type map', async () => {
  const series = syntheticWhiteFm(4096, 777, 1);
  const doubled = series.map((v) => 2 * v);
  const a = await postRecord({ kind: 'frequency', tau0: 1, series });
  const b = await postRecord({ kind: 'frequency', tau0: 1, series: doubled });
  const ra = (await getRecord(a.body.id)).body;
  const rb = (await getRecord(b.body.id)).body;
  assert.equal(ra.curve.length, rb.curve.length);
  for (let i = 0; i < ra.curve.length; i++) {
    const ratio = rb.curve[i].sigmaY / ra.curve[i].sigmaY;
    assert.ok(Math.abs(ratio - 2) < 1e-9, `m=${ra.curve[i].m}: ratio ${ratio}`);
    assert.equal(rb.curve[i].noiseType, ra.curve[i].noiseType);
  }
});

// --- all-zero series ------------------------------------------------------

test('all-zero series yields exactly zero sigma_y at every tau', async () => {
  const { body } = await postRecord({
    kind: 'frequency',
    tau0: 1,
    series: new Array(128).fill(0),
  });
  assert.equal(body.status, 'done');
  const { body: record } = await getRecord(body.id);
  assert.ok(record.curve.length > 0);
  for (const row of record.curve) assert.equal(row.sigmaY, 0);
});

// --- T/3 trimming ----------------------------------------------------------

test('tau values beyond T/3 are cut from the curve', async () => {
  // phase, 31 points, tau0 = 2 -> T = 60, T/3 = 20 -> m <= 10
  const series = gaussianSeries(31, 11);
  const { body } = await postRecord({ kind: 'phase', tau0: 2, series });
  assert.equal(body.status, 'done');
  const { body: record } = await getRecord(body.id);
  const taus = record.curve.map((r) => r.tau);
  assert.deepEqual(taus, [2, 4, 10, 20]);
  const duration = (31 - 1) * 2;
  for (const row of record.curve) {
    assert.ok(row.tau <= duration / 3, `tau=${row.tau} exceeds T/3`);
  }
});

// --- phase vs frequency consistency ---------------------------------------

test('same physical process as phase and as frequency agree at each tau', async () => {
  const tau0 = 0.25;
  // random-walk-ish phase with white noise on top, 2049 points
  const noise = gaussianSeries(2049, 31415);
  let acc = 0;
  const phase = noise.map((v) => (acc += v * 0.3) + v * 0.01);
  const freq = [];
  for (let i = 0; i + 1 < phase.length; i++) freq.push((phase[i + 1] - phase[i]) / tau0);

  const a = await postRecord({ kind: 'phase', tau0, series: phase });
  const b = await postRecord({ kind: 'frequency', tau0, series: freq });
  assert.equal(a.body.status, 'done');
  assert.equal(b.body.status, 'done');
  const ra = (await getRecord(a.body.id)).body;
  const rb = (await getRecord(b.body.id)).body;
  assert.deepEqual(ra.mList, rb.mList);
  for (let i = 0; i < ra.curve.length; i++) {
    const sa = ra.curve[i].sigmaY;
    const sb = rb.curve[i].sigmaY;
    assert.ok(
      Math.abs(sa - sb) <= 1e-9 * sa,
      `tau=${ra.curve[i].tau}: phase ${sa} vs frequency ${sb}`,
    );
  }
});

// --- overlapping estimator is really overlapping ---------------------------

// Independent reference implementations used only to pin the service down.
function overlappingReference(y, m) {
  const n = y.length;
  const terms = n - 2 * m + 1;
  let sum = 0;
  for (let j = 0; j < terms; j++) {
    let a = 0;
    let b = 0;
    for (let k = 0; k < m; k++) {
      a += y[j + k];
      b += y[j + m + k];
    }
    const d = (b - a) / m;
    sum += d * d;
  }
  return Math.sqrt(sum / (2 * terms));
}

function nonOverlappingImpostor(y, m) {
  const n = y.length;
  const blocks = Math.floor(n / m);
  const avgs = [];
  for (let b = 0; b < blocks; b++) {
    let s = 0;
    for (let k = 0; k < m; k++) s += y[b * m + k];
    avgs.push(s / m);
  }
  let sum = 0;
  for (let j = 0; j + 1 < avgs.length; j++) sum += (avgs[j + 1] - avgs[j]) ** 2;
  return Math.sqrt(sum / (2 * (avgs.length - 1)));
}

test('service matches a true overlapping estimate, not a non-overlapping one', async () => {
  const series = syntheticWhiteFm(2048, 60606, 1);
  const { body } = await postRecord({ kind: 'frequency', tau0: 1, series });
  assert.equal(body.status, 'done');
  const { body: record } = await getRecord(body.id);

  let maxImpostorRelDiff = 0;
  for (const row of record.curve) {
    const expected = overlappingReference(series, row.m);
    assert.ok(
      Math.abs(row.sigmaY - expected) <= 1e-12 * expected,
      `m=${row.m}: service ${row.sigmaY} vs overlapping reference ${expected}`,
    );
    if (row.m >= 2) {
      const impostor = nonOverlappingImpostor(series, row.m);
      maxImpostorRelDiff = Math.max(
        maxImpostorRelDiff,
        Math.abs(impostor - expected) / expected,
      );
    }
  }
  // A non-overlapping estimator would land measurably off the service curve.
  assert.ok(
    maxImpostorRelDiff > 1e-6,
    `non-overlapping impostor coincided with the service (max rel diff ${maxImpostorRelDiff})`,
  );
});

// --- tau0 halving (denser sampling of the same process) --------------------

test('halving tau0 keeps sigma_y at the same physical tau', async () => {
  const fine = syntheticWhiteFm(8192, 909090, 1);
  const coarse = [];
  for (let i = 0; i + 1 < fine.length; i += 2) coarse.push((fine[i] + fine[i + 1]) / 2);

  const a = await postRecord({ kind: 'frequency', tau0: 0.5, series: fine });
  const b = await postRecord({ kind: 'frequency', tau0: 1, series: coarse });
  assert.equal(a.body.status, 'done');
  assert.equal(b.body.status, 'done');
  const ra = (await getRecord(a.body.id)).body;
  const rb = (await getRecord(b.body.id)).body;

  const fineByTau = new Map(ra.curve.map((r) => [r.tau, r.sigmaY]));
  const common = rb.curve.filter((r) => fineByTau.has(r.tau));
  assert.ok(common.length >= 5, 'enough common physical taus');
  // compare away from the noisy long-tau edge
  for (const row of common.slice(0, -2)) {
    const relDiff = Math.abs(fineByTau.get(row.tau) - row.sigmaY) / row.sigmaY;
    assert.ok(relDiff < 0.05, `tau=${row.tau}: rel diff ${relDiff}`);
  }
});

// --- failure modes ----------------------------------------------------------

test('non-positive tau0 fails the record with a reason', async () => {
  const series = syntheticWhiteFm(64, 1, 1);
  for (const tau0 of [0, -1]) {
    const { httpStatus, body } = await postRecord({ kind: 'frequency', tau0, series });
    assert.equal(httpStatus, 201);
    assert.equal(body.status, 'failed');
    assert.match(body.reason, /tau0/);
    const { body: record } = await getRecord(body.id);
    assert.equal(record.status, 'failed');
    assert.equal(record.curve, undefined, 'failed record carries no curve');
  }
});

test('too-short series is refused', async () => {
  const { body } = await postRecord({ kind: 'phase', tau0: 1, series: [0, 1, 0, 1] });
  assert.equal(body.status, 'failed');
  assert.match(body.reason, /too short/);
});

test('missing fields and non-finite samples fail with reasons', async () => {
  const missing = await postRecord({});
  assert.equal(missing.body.status, 'failed');
  assert.match(missing.body.reason, /kind/);
  assert.match(missing.body.reason, /tau0/);
  assert.match(missing.body.reason, /series/);

  const badKind = await postRecord({
    kind: 'allan',
    tau0: 1,
    series: syntheticWhiteFm(64, 2, 1),
  });
  assert.equal(badKind.body.status, 'failed');

  // 1e999 parses to Infinity -> must be caught by the finite check
  const nonFinite = await postRecord(
    '{"kind":"frequency","tau0":1,"series":[1,2,3,4,5,6,7,1e999]}',
  );
  assert.equal(nonFinite.body.status, 'failed');
  assert.match(nonFinite.body.reason, /finite/);
});

// --- no cross-record contamination -----------------------------------------

test('one record leaves no sliding-window residue for the next', async () => {
  const series = syntheticWhiteFm(1024, 1357, 1);
  const first = await postRecord({ kind: 'frequency', tau0: 1, series });
  const zeros = await postRecord({
    kind: 'frequency',
    tau0: 1,
    series: new Array(1024).fill(0),
  });
  const again = await postRecord({ kind: 'frequency', tau0: 1, series });

  const rz = (await getRecord(zeros.body.id)).body;
  for (const row of rz.curve) assert.equal(row.sigmaY, 0);

  const r1 = (await getRecord(first.body.id)).body;
  const r2 = (await getRecord(again.body.id)).body;
  assert.deepEqual(
    r2.curve.map((r) => r.sigmaY),
    r1.curve.map((r) => r.sigmaY),
  );
});

// --- retrieval shapes --------------------------------------------------------

test('list gives summaries only; get by id gives the full record', async () => {
  const series = syntheticWhiteFm(256, 2468, 1);
  const { body } = await postRecord({ kind: 'frequency', tau0: 0.1, series, label: 't' });
  const list = await (await fetch(`${base}/records`)).json();
  const entry = list.find((r) => r.id === body.id);
  assert.equal(entry.points, 256);
  assert.equal(entry.tau0, 0.1);
  assert.equal(typeof entry.hasWhiteFM, 'boolean');
  assert.equal(entry.series, undefined, 'summary must not carry the series');
  assert.equal(entry.curve, undefined, 'summary must not carry the curve');

  const { body: full } = await getRecord(body.id);
  assert.equal(full.series.length, 256);
  assert.equal(full.kind, 'frequency');
  assert.equal(full.tau0, 0.1);
  assert.deepEqual(full.mList, full.curve.map((r) => r.m));
  assert.ok(full.curve.every((r) => 'sigmaY' in r && 'noiseType' in r));
  assert.deepEqual(Object.keys(full.slopeIntervals).sort(), [
    'random_walk_fm',
    'white_fm',
    'white_pm',
  ]);
});

test('unknown record id is a 404', async () => {
  const { httpStatus } = await getRecord(999999);
  assert.equal(httpStatus, 404);
});

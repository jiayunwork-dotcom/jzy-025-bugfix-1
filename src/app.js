// Express app factory. Kept separate from server.js so tests can mount the
// app on an ephemeral port with an in-memory store.

import express from 'express';
import { analyzeSeries } from './compute.js';
import { validateSubmission } from './validate.js';

export function createApp(store) {
  const app = express();
  app.use(express.json({ limit: '64mb' }));

  // Submit one record segment. Every submission is persisted; invalid or
  // uncomputable ones come back as status "failed" with a reason and never
  // carry a curve.
  app.post('/records', (req, res) => {
    const body = req.body ?? {};
    const label = typeof body.label === 'string' ? body.label : null;

    const validation = validateSubmission(body);
    if (!validation.ok) {
      const reason = validation.errors.join('; ');
      const id = store.insert({
        label,
        kind: typeof body.kind === 'string' ? body.kind : null,
        tau0: typeof body.tau0 === 'number' && Number.isFinite(body.tau0) ? body.tau0 : null,
        points: Array.isArray(body.series) ? body.series.length : null,
        status: 'failed',
        reason,
        payload: { submitted: body },
      });
      return res.status(201).json({ id, status: 'failed', reason });
    }

    const { kind, tau0, series } = validation.value;
    const result = analyzeSeries(kind, tau0, series);

    if (result.status === 'failed') {
      const id = store.insert({
        label,
        kind,
        tau0,
        points: series.length,
        status: 'failed',
        reason: result.reason,
        payload: { series },
      });
      return res.status(201).json({ id, status: 'failed', reason: result.reason });
    }

    const id = store.insert({
      label,
      kind,
      tau0,
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
    return res.status(201).json({
      id,
      status: 'done',
      kind,
      tau0,
      points: series.length,
      hasWhiteFM: result.hasWhiteFM,
    });
  });

  // Summaries only: point count, tau0, white-FM flag.
  app.get('/records', (req, res) => {
    res.json(store.list());
  });

  // Full record: raw series, kind, tau0, m list, per-tau sigma_y + noise
  // type, and the slope intervals used.
  app.get('/records/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'record id must be a positive integer' });
    }
    const record = store.get(id);
    if (!record) return res.status(404).json({ error: `no record ${id}` });
    res.json(record);
  });

  // Malformed JSON bodies land here.
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
      return res.status(400).json({ error: 'request body is not valid JSON' });
    }
    next(err);
  });

  return app;
}

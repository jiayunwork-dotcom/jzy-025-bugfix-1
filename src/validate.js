// Submission validation. Every rejected submission is still persisted as a
// failed record (with the reason) by the caller — validation only decides
// and explains, it never throws the record away.

// Pinned service lower bound: shorter series are refused outright.
export const MIN_POINTS = 8;

export const KINDS = Object.freeze(['phase', 'frequency']);

/**
 * @param {unknown} body parsed JSON request body
 * @returns {{ ok: true, value: { kind: string, tau0: number, series: number[] } }
 *          | { ok: false, errors: string[] }}
 */
export function validateSubmission(body) {
  const errors = [];
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errors: ['request body must be a JSON object'] };
  }

  const { kind, tau0, series } = body;

  if (!KINDS.includes(kind)) {
    errors.push(`kind must be one of ${KINDS.map((k) => `"${k}"`).join(', ')}`);
  }

  if (typeof tau0 !== 'number' || !Number.isFinite(tau0) || tau0 <= 0) {
    errors.push('tau0 must be a positive finite number');
  }

  if (!Array.isArray(series)) {
    errors.push('series must be an array of finite numbers');
  } else {
    if (series.length < MIN_POINTS) {
      errors.push(`series too short: need at least ${MIN_POINTS} points, got ${series.length}`);
    }
    if (series.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
      errors.push('series must contain only finite numbers');
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { kind, tau0, series } };
}

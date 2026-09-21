// Record persistence in an in-process SQLite database (no external server).
// Every submission is written to disk immediately — done or failed.

import Database from 'better-sqlite3';

export class RecordStore {
  /**
   * @param {string} dbPath file path, or ':memory:' for tests
   */
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS records (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at    TEXT NOT NULL,
        label         TEXT,
        kind          TEXT,
        tau0          REAL,
        points        INTEGER,
        status        TEXT NOT NULL CHECK (status IN ('done', 'failed')),
        reason        TEXT,
        has_white_fm  INTEGER NOT NULL DEFAULT 0,
        payload       TEXT NOT NULL
      )
    `);
    this.insertStmt = this.db.prepare(`
      INSERT INTO records (created_at, label, kind, tau0, points, status, reason, has_white_fm, payload)
      VALUES (@createdAt, @label, @kind, @tau0, @points, @status, @reason, @hasWhiteFM, @payload)
    `);
    this.getStmt = this.db.prepare('SELECT * FROM records WHERE id = ?');
    this.listStmt = this.db.prepare(
      'SELECT id, created_at, label, kind, tau0, points, status, reason, has_white_fm FROM records ORDER BY id',
    );
    this.labelStmt = this.db.prepare('SELECT id FROM records WHERE label = ? LIMIT 1');
  }

  /**
   * Persist one record. Returns the new record id.
   * payload is stored as JSON: for done records it carries the raw series,
   * kind/tau0, the m list, per-tau sigma_y + noise type, and the slope
   * intervals used; for failed records it carries the raw submission.
   */
  insert({ label = null, kind = null, tau0 = null, points = null, status, reason = null, hasWhiteFM = false, payload }) {
    const info = this.insertStmt.run({
      createdAt: new Date().toISOString(),
      label,
      kind,
      tau0,
      points,
      status,
      reason,
      hasWhiteFM: hasWhiteFM ? 1 : 0,
      payload: JSON.stringify(payload ?? null),
    });
    return Number(info.lastInsertRowid);
  }

  /** Full record by id, payload parsed. Null when absent. */
  get(id) {
    const row = this.getStmt.get(id);
    if (!row) return null;
    return {
      id: row.id,
      createdAt: row.created_at,
      label: row.label,
      kind: row.kind,
      tau0: row.tau0,
      points: row.points,
      status: row.status,
      reason: row.reason,
      hasWhiteFM: row.has_white_fm === 1,
      ...JSON.parse(row.payload),
    };
  }

  /** Summaries only: point count, tau0, and whether a white-FM region was found. */
  list() {
    return this.listStmt.all().map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      label: row.label,
      kind: row.kind,
      tau0: row.tau0,
      points: row.points,
      status: row.status,
      reason: row.reason,
      hasWhiteFM: row.has_white_fm === 1,
    }));
  }

  hasLabel(label) {
    return this.labelStmt.get(label) !== undefined;
  }

  close() {
    this.db.close();
  }
}

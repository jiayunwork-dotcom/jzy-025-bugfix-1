// Service entrypoint: open the on-disk SQLite store, seed the preset
// white-FM record, and serve HTTP.

import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app.js';
import { seedPresetRecord } from './seed.js';
import { RecordStore } from './storage.js';

const port = Number(process.env.PORT ?? 3000);
const dbPath = process.env.DB_PATH ?? path.join(process.env.DATA_DIR ?? 'data', 'records.db');

if (dbPath !== ':memory:') {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const store = new RecordStore(dbPath);
const presetId = seedPresetRecord(store);

const app = createApp(store);
app.listen(port, () => {
  console.log(`clock-stability service listening on :${port} (db=${dbPath}, preset record id=${presetId})`);
});

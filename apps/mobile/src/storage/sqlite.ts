import { Change, conflictMessage, StorageAdapter, Stored } from './contract';

export interface SQLConnection {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: (string | number | null)[]): Promise<unknown>;
  getAllAsync<T>(sql: string, ...params: (string | number | null)[]): Promise<T[]>;
}
export interface SQLDatabase extends SQLConnection {
  withExclusiveTransactionAsync(task: (tx: SQLConnection) => Promise<void>): Promise<void>;
  closeAsync(): Promise<void>;
}
export const migration1 = `
CREATE TABLE records(key TEXT PRIMARY KEY NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL);
CREATE TABLE meta(key TEXT PRIMARY KEY NOT NULL,value INTEGER NOT NULL);
INSERT INTO meta(key,value) VALUES('revision',0);
PRAGMA user_version=1;`;
export const migration2 = `ALTER TABLE records ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
CREATE INDEX records_kind ON records(kind);
PRAGMA user_version=2;`;

export async function openSQLStorage(db: SQLDatabase): Promise<StorageAdapter> {
  await db.execAsync('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
  const version = (await db.getAllAsync<{ user_version: number }>('PRAGMA user_version'))[0].user_version;
  if (version > 2) { await db.closeAsync(); throw new Error('This database needs a newer app. No records were deleted.'); }
  if (version < 2) await db.withExclusiveTransactionAsync(async tx => {
    if (version < 1) await tx.execAsync(migration1);
    await tx.execAsync(migration2);
  });
  return {
    async load() {
      let records: Stored[] = [], revision = 0;
      await db.withExclusiveTransactionAsync(async tx => {
        const rows = await tx.getAllAsync<{ key: string; kind: Stored['kind']; id: string; payload: string }>('SELECT key,kind,id,payload FROM records');
        records = rows.map(row => ({ key: row.key, kind: row.kind, id: row.id, value: JSON.parse(row.payload) as unknown }));
        revision = (await tx.getAllAsync<{ value: number }>("SELECT value FROM meta WHERE key='revision'"))[0].value;
      });
      return { records, revision };
    },
    async commit(changes: Change[], expectedRevision: number) {
      await db.withExclusiveTransactionAsync(async tx => {
        const revision = (await tx.getAllAsync<{ value: number }>("SELECT value FROM meta WHERE key='revision'"))[0].value;
        if (revision !== expectedRevision) throw new Error(conflictMessage);
        for (const change of changes) {
          if (change.type === 'put') await tx.runAsync('INSERT INTO records(key,kind,id,payload,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at', change.record.key, change.record.kind, change.record.id, JSON.stringify(change.record.value), Date.now());
          else await tx.runAsync('DELETE FROM records WHERE key=?', change.key);
        }
        await tx.runAsync("UPDATE meta SET value=? WHERE key='revision'", expectedRevision + 1);
      });
      return expectedRevision + 1;
    },
    close: () => db.closeAsync(),
  };
}

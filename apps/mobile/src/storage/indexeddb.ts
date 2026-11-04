import { Change, conflictMessage, Loaded, StorageAdapter, Stored } from './contract';

export function openBrowserStorage(name = 'touche-grasse-v1'): Promise<StorageAdapter> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('meta')) { const meta = db.createObjectStore('meta'); meta.put(0, 'revision'); }
    };
    request.onerror = () => reject(request.error ?? new Error('Could not open local browser storage.'));
    request.onblocked = () => reject(new Error('Close other Touche Grasse windows before the storage upgrade.'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve({
        load: () => new Promise<Loaded>((done, fail) => {
          const tx = db.transaction(['records', 'meta'], 'readonly');
          const records = tx.objectStore('records').getAll();
          const revision = tx.objectStore('meta').get('revision');
          tx.oncomplete = () => done({ records: records.result as Stored[], revision: (revision.result as number | undefined) ?? 0 });
          tx.onabort = () => fail(tx.error ?? new Error('Reading was interrupted.'));
          tx.onerror = () => fail(tx.error);
        }),
        commit: (changes: Change[], expectedRevision: number) => new Promise<number>((done, fail) => {
          const tx = db.transaction(['records', 'meta'], 'readwrite');
          const meta = tx.objectStore('meta'), records = tx.objectStore('records');
          let failure: Error | undefined;
          const read = meta.get('revision');
          read.onsuccess = () => {
            if ((read.result ?? 0) !== expectedRevision) { failure = new Error(conflictMessage); tx.abort(); return; }
            for (const change of changes) {
              if (change.type === 'put') records.put(change.record); else records.delete(change.key);
            }
            meta.put(expectedRevision + 1, 'revision');
          };
          tx.oncomplete = () => done(expectedRevision + 1);
          tx.onabort = () => fail(failure ?? tx.error ?? new Error('Saving was interrupted. No changes were saved.'));
          tx.onerror = () => { failure = tx.error ?? undefined; };
        }),
        close: async () => db.close(),
      });
    };
  });
}

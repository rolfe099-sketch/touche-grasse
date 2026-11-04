import { RecoveryPort, recoveryCopySchema, recoveryMetaSchema } from '../domain/recovery';

// Separate from the active diary DB so recovery survives a failed diary upgrade
// or accidental record deletion. Clearing site data still removes both stores.
export async function openRecoveryPort(name = 'touche-grasse-recovery-v1'): Promise<RecoveryPort> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1); request.onupgradeneeded = () => { request.result.createObjectStore('copies', { keyPath: 'id' }); request.result.createObjectStore('metadata', { keyPath: 'id' }); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error('Close other app windows to open recovery storage.'));
  });
  db.onversionchange = () => db.close();
  function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>, storeName = 'copies'): Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode), request = work(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(request.result); tx.onabort = () => reject(tx.error ?? new Error('Recovery storage was interrupted.')); tx.onerror = () => reject(tx.error);
    });
  }
  return {
    async list() { const values = await transaction<unknown[]>('readonly', store => store.getAll(), 'metadata'); return values.flatMap(value => { const result = recoveryMetaSchema.safeParse(value); return result.success ? [result.data] : []; }); },
    async read(id) { recoveryMetaSchema.shape.id.parse(id); return recoveryCopySchema.parse(await transaction('readonly', store => store.get(id))); },
    async write(input) {
      const copy = recoveryCopySchema.parse(input), meta = recoveryMetaSchema.parse(copy);
      await new Promise<void>((resolve, reject) => { const tx = db.transaction(['copies', 'metadata'], 'readwrite'); tx.objectStore('copies').put(copy); tx.objectStore('metadata').put(meta); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error); });
    },
    async remove(id) {
      recoveryMetaSchema.shape.id.parse(id); await new Promise<void>((resolve, reject) => { const tx = db.transaction(['copies', 'metadata'], 'readwrite'); tx.objectStore('copies').delete(id); tx.objectStore('metadata').delete(id); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error); });
    },
  };
}

import * as FileSystem from 'expo-file-system/legacy';
import { RecoveryPort, recoveryCopySchema, recoveryMetaSchema } from '../domain/recovery';

export async function openRecoveryPort(): Promise<RecoveryPort> {
  if (!FileSystem.documentDirectory) throw new Error('On-device recovery storage is unavailable. Export a backup to keep a separate copy.');
  const root = FileSystem.documentDirectory + 'touche-grasse-recovery/';
  const file = (id: string) => root + recoveryMetaSchema.shape.id.parse(id) + '.json';
  const metadata = (id: string) => root + recoveryMetaSchema.shape.id.parse(id) + '.meta.json';
  let maintained = false;
  const read: RecoveryPort['read'] = async id => {
    const info = await FileSystem.getInfoAsync(file(id));
    if (!info.exists || info.isDirectory || info.size > 110000000) throw new Error('This recovery copy is unavailable or too large.');
    const copy = recoveryCopySchema.parse(JSON.parse(await FileSystem.readAsStringAsync(file(id))));
    if (copy.id !== id) throw new Error('This recovery copy has an invalid identity.'); return copy;
  };
  return {
    read,
    async list() {
      if (!(await FileSystem.getInfoAsync(root)).exists) return [];
      const names = (await FileSystem.readDirectoryAsync(root)).filter(name => /^[a-zA-Z0-9_-]{1,100}\.meta\.json$/.test(name));
      const result = await Promise.all(names.map(async name => {
        try {
          const id = name.slice(0, -10), info = await FileSystem.getInfoAsync(metadata(id));
          if (!info.exists || info.isDirectory || info.size > 2000 || !(await FileSystem.getInfoAsync(file(id))).exists) return null;
          const meta = recoveryMetaSchema.parse(JSON.parse(await FileSystem.readAsStringAsync(metadata(id)))); return meta.id === id ? meta : null;
        } catch { return null; }
      })); return result.filter((item): item is NonNullable<typeof item> => item !== null);
    },
    async write(input) {
      const copy = recoveryCopySchema.parse(input), destination = file(copy.id), partial = destination + '.partial';
      await FileSystem.makeDirectoryAsync(root, { intermediates: true });
      if (!maintained) {
        const names = await FileSystem.readDirectoryAsync(root);
        for (const name of names) {
          if (/^[a-zA-Z0-9_-]{1,100}(\.meta)?\.json\.partial$/.test(name)) await FileSystem.deleteAsync(root + name, { idempotent: true });
          else if (/^[a-zA-Z0-9_-]{1,100}\.json$/.test(name) && !names.includes(name.slice(0, -5) + '.meta.json')) await FileSystem.deleteAsync(root + name, { idempotent: true });
        }
        maintained = true;
      }
      const meta = recoveryMetaSchema.parse(copy), metaFile = metadata(copy.id), metaPartial = metaFile + '.partial';
      try {
        await FileSystem.writeAsStringAsync(partial, JSON.stringify(copy)); await FileSystem.moveAsync({ from: partial, to: destination });
        await FileSystem.writeAsStringAsync(metaPartial, JSON.stringify(meta)); await FileSystem.moveAsync({ from: metaPartial, to: metaFile });
      } catch (error) { await FileSystem.deleteAsync(destination, { idempotent: true }); throw error; }
      finally { await FileSystem.deleteAsync(partial, { idempotent: true }); await FileSystem.deleteAsync(metaPartial, { idempotent: true }); }
    },
    async remove(id) { await FileSystem.deleteAsync(metadata(id), { idempotent: true }); await FileSystem.deleteAsync(file(id), { idempotent: true }); },
  };
}

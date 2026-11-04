import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as Crypto from 'expo-crypto';

const maxBackupBytes = 50_000_000;
export async function exportBackup(json: string) {
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device.');
  if (!FileSystem.cacheDirectory) throw new Error('Temporary file storage is unavailable. Your records are kept.');
  const uri = `${FileSystem.cacheDirectory}ToucheGrasse-${Crypto.randomUUID()}-backup.json`;
  try {
    await FileSystem.writeAsStringAsync(uri, json);
    await Sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save backup' });
  } finally { await FileSystem.deleteAsync(uri, { idempotent: true }); }
}
export async function pickBackup(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) throw new Error('No backup file was selected.');
  try {
    if ((asset.size ?? 0) > maxBackupBytes) throw new Error('This file is too large.');
    const info = await FileSystem.getInfoAsync(asset.uri);
    if (!info.exists || info.isDirectory) throw new Error('This backup file is unavailable. Choose it again.');
    if (info.size > maxBackupBytes) throw new Error('This file is too large.');
    return await FileSystem.readAsStringAsync(asset.uri);
  } finally {
    // Only delete the picker-created sandbox copy, never a provider's original.
    if (FileSystem.cacheDirectory && asset.uri.startsWith(FileSystem.cacheDirectory)) await FileSystem.deleteAsync(asset.uri, { idempotent: true });
  }
}

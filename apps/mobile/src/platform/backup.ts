import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
export async function exportBackup(json: string) {
  const uri = FileSystem.cacheDirectory + 'ToucheGrasse-backup.json';
  await FileSystem.writeAsStringAsync(uri, json);
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save backup' });
}
export async function pickBackup(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
  if (result.canceled) return null;
  if ((result.assets[0].size ?? 0) > 50_000_000) throw new Error('This file is too large.');
  return FileSystem.readAsStringAsync(result.assets[0].uri);
}

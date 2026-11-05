import { PickedBackup } from './backup.types';
export async function exportBackup(json: string) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'ToucheGrasse-backup.json';
  try { document.body.appendChild(link); link.click(); }
  catch (error) { URL.revokeObjectURL(url); throw error; }
  finally { link.remove(); }
  // Slow browser downloads may not have consumed the blob after one second.
  // Keep it alive briefly; the document also releases object URLs on unload.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function pickBackup(): Promise<PickedBackup | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json,.json';
    input.oncancel = () => resolve(null);
    input.onchange = () => { const file = input.files?.[0]; if (!file) { resolve(null); return; } if (file.size > 50_000_000) { reject(new Error('This file is too large.')); return; } void file.text().then(json => resolve({ json, name: file.name || 'Backup file' }), reject); };
    input.click();
  });
}

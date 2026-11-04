export async function exportBackup(json: string) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'ToucheGrasse-backup.json';
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function pickBackup(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json,.json';
    input.oncancel = () => resolve(null);
    input.onchange = () => { const file = input.files?.[0]; if (!file) { resolve(null); return; } if (file.size > 50_000_000) { reject(new Error('This file is too large.')); return; } void file.text().then(resolve, reject); };
    input.click();
  });
}

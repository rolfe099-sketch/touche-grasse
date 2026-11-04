export function pickPhoto(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp';
    input.oncancel = () => resolve(null);
    input.onchange = () => {
      const file = input.files?.[0]; if (!file) { resolve(null); return; }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { reject(new Error('Choose a JPEG, PNG or WebP photo.')); return; }
      if (file.size > 2_000_000) { reject(new Error('Choose a photo smaller than 2 MB.')); return; }
      const reader = new FileReader(); reader.onerror = () => reject(new Error('Could not read this photo.')); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file);
    };
    input.click();
  });
}

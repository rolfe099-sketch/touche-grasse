import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
export async function pickPhoto(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.9, exif: false });
  if (result.canceled) return null;
  const asset = result.assets[0], context = ImageManipulator.manipulate(asset.uri);
  try {
    if (Math.max(asset.width, asset.height) > 1600) context.resize(asset.width >= asset.height ? { width: 1600 } : { height: 1600 });
    const image = await context.renderAsync();
    try {
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.78, base64: true });
      if (!saved.base64 || saved.base64.length > 2_666_668) throw new Error('This photo is still too large. Choose a smaller photo.');
      return `data:image/jpeg;base64,${saved.base64}`;
    } finally { image.release(); }
  } finally { context.release(); }
}

import { LabelDocument } from '../domain/nutritionLabel';
import { ImageSize, LabelImageEdit } from '../domain/labelImage';
export type LabelPhoto = ImageSize & { uri: string; release: () => Promise<void> };
export type LabelPhotoView = ImageSize & { uri: string };
export type LabelPhotoTransform = (photo: LabelPhotoView, edit: LabelImageEdit, signal: AbortSignal) => Promise<LabelPhoto>;
export type LabelPhotoSource = 'camera' | 'library';
export interface LabelOCR { available: boolean; unavailable?: string; recognize(uri: string, signal: AbortSignal): Promise<LabelDocument>; }

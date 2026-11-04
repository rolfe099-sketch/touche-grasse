import { LabelDocument } from '../domain/nutritionLabel';
export type LabelPhoto = { uri: string; release: () => Promise<void> };
export type LabelPhotoSource = 'camera' | 'library';
export interface LabelOCR { available: boolean; unavailable?: string; recognize(uri: string, signal: AbortSignal): Promise<LabelDocument>; }

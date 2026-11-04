import { Line } from './model';
// Integration boundary only. Implementations must produce editable, unconfirmed candidates.
// A camera image is not OCR; TTS is not speech recognition. No hidden mock recognition provider.
export type RecognitionCandidate = { kind: 'barcode'; value: string } | {
  kind: 'label'; rawText: string; basis: '100g' | '100ml' | 'serving' | 'unknown';
  fields: { nutrient: string; text: string; confidence: number | null; sourceRegion?: [number, number, number, number] }[];
};
export type CookingIntent = { action: 'add'; line: Line } | { action: 'changeQuantity'; ingredientId: string; quantityText: string }
  | { action: 'nextStep' | 'previousStep' | 'repeatInstruction' | 'cancel' };
export interface SpeechSession {
  start(locale: 'nb-NO' | 'en-US', onTranscript: (text: string) => void): Promise<void>;
  stop(): Promise<void>;
  cancel(): Promise<void>;
}

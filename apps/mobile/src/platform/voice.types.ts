export type VoiceCallbacks = { onText: (text: string, final: boolean) => void; onState: (listening: boolean) => void; onError: (message: string) => void };
export type VoiceController = { available: boolean; unavailable: string; start: (locale: 'en-US' | 'nb-NO', callbacks: VoiceCallbacks) => Promise<void>; stop: () => void; cancel: () => void };

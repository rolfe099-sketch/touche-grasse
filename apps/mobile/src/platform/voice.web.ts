import { VoiceCallbacks, VoiceController } from './voice.types';
type Result = { isFinal: boolean; 0: { transcript: string } };
type Recognizer = { lang: string; interimResults: boolean; continuous: boolean; onstart: (() => void) | null; onend: (() => void) | null; onerror: ((event: { error: string }) => void) | null; onresult: ((event: { resultIndex: number; results: ArrayLike<Result> }) => void) | null; start: () => void; stop: () => void; abort: () => void };
type SpeechWindow = typeof globalThis & { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
export function createVoiceController(): VoiceController {
  const browser = globalThis as SpeechWindow, Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
  let recognition: Recognizer | undefined, callbacks: VoiceCallbacks | undefined;
  const cancel = () => { if (recognition) { recognition.onstart = null; recognition.onresult = null; recognition.onerror = null; recognition.onend = null; recognition.abort(); recognition = undefined; } callbacks?.onState(false); };
  return {
    available: !!Constructor,
    unavailable: 'Voice is unavailable in this browser. Use keyboard dictation or type a command below.',
    async start(locale, next) {
      cancel(); if (!Constructor) throw new Error('This browser does not support voice input.');
      callbacks = next; const session = new Constructor(); recognition = session; let delivered = false;
      session.lang = locale; session.interimResults = true; session.continuous = false;
      session.onstart = () => next.onState(true); session.onend = () => next.onState(false);
      session.onerror = event => { next.onState(false); next.onError(event.error === 'not-allowed' ? 'Microphone access is off. Allow it in browser settings, or type your command.' : event.error === 'no-speech' ? 'No speech detected. Try again.' : `Speech unavailable (${event.error}). You can type instead.`); };
      session.onresult = event => { if (delivered) return; for (let i = event.resultIndex; i < event.results.length; i++) { const result = event.results[i]; if (result.isFinal) delivered = true; next.onText(result[0].transcript, result.isFinal); if (delivered) break; } };
      session.start();
    }, stop() { recognition?.stop(); }, cancel,
  };
}

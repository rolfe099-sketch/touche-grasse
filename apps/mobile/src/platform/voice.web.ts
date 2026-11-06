import { VoiceCallbacks, VoiceController } from './voice.types';
type Result = { isFinal: boolean; 0: { transcript: string } };
type Recognizer = { lang: string; interimResults: boolean; continuous: boolean; onstart: (() => void) | null; onend: (() => void) | null; onerror: ((event: { error: string }) => void) | null; onresult: ((event: { resultIndex: number; results: ArrayLike<Result> }) => void) | null; start: () => void; stop: () => void; abort: () => void };
type SpeechWindow = typeof globalThis & { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
export function createVoiceController(): VoiceController {
  const browser = globalThis as SpeechWindow, Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
  let recognition: Recognizer | undefined, callbacks: VoiceCallbacks | undefined;
  const detach = (session: Recognizer) => { session.onstart = null; session.onresult = null; session.onerror = null; session.onend = null; };
  const cancel = () => { const session = recognition; recognition = undefined; if (session) { detach(session); session.abort(); } callbacks?.onState(false); callbacks = undefined; };
  return {
    available: !!Constructor,
    unavailable: 'Voice is unavailable in this browser. Use keyboard dictation or type a command below.',
    async start(locale, next) {
      cancel(); if (!Constructor) throw new Error('This browser does not support voice input.');
      callbacks = next; const session = new Constructor(); recognition = session; let text = '', complete = false;
      const active = () => recognition === session;
      session.lang = locale; session.interimResults = true; session.continuous = false;
      session.onstart = () => { if (active()) next.onState(true); };
      session.onend = () => { if (active()) { recognition = undefined; callbacks = undefined; detach(session); next.onState(false); if (text && complete) next.onText(text, true); } };
      session.onerror = event => { if (!active()) return; cancel(); next.onError(event.error === 'not-allowed' ? 'Microphone access is off. Allow it in browser settings, or type your command.' : event.error === 'no-speech' ? 'No speech detected. Try again.' : `Speech unavailable (${event.error}). You can type instead.`); };
      // Web Speech results are a cumulative list. A final segment can precede
      // later segments in the same utterance; commit once, after recognition ends.
      session.onresult = event => {
        if (!active()) return;
        const results = Array.from(event.results);
        text = results.map(result => result[0].transcript.trim()).filter(Boolean).join(' ');
        complete = results.length > 0 && results.every(result => result.isFinal);
        next.onText(text, false);
      };
      try { session.start(); } catch (error) { cancel(); throw error; }
    }, stop() { recognition?.stop(); }, cancel,
  };
}

import type { ExpoSpeechRecognitionModuleType } from 'expo-speech-recognition/build/ExpoSpeechRecognitionModule.types';
import type { VoiceCallbacks, VoiceController } from './voice.types';

export type NativeSpeech = Pick<ExpoSpeechRecognitionModuleType, 'isRecognitionAvailable' | 'requestPermissionsAsync' | 'addListener' | 'start' | 'stop' | 'abort'>;

// Keep permission requests and native events tied to the capture that created
// them. Cancelling or replacing a session invalidates its async continuations.
export function createNativeVoiceController(speech: NativeSpeech | null): VoiceController {
  let generation = 0;
  let current: { callbacks: VoiceCallbacks; listeners: { remove: () => void }[] } | undefined;
  const release = () => {
    const previous = current; current = undefined;
    previous?.listeners.forEach(listener => listener.remove());
    previous?.callbacks.onState(false);
  };
  const cancel = () => {
    generation++;
    const wasCapturing = !!current;
    release();
    if (wasCapturing) speech?.abort();
  };
  return {
    available: !!speech && speech.isRecognitionAvailable(),
    unavailable: speech ? 'Speech recognition is unavailable on this device. Use keyboard dictation or type below.' : 'Direct voice needs an iOS development build. In Expo Go, use the keyboard microphone in the command field.',
    async start(locale, callbacks) {
      cancel();
      const token = generation;
      if (!speech) throw new Error('Use keyboard dictation here, or open the app in a development build.');
      try {
        const permission = await speech.requestPermissionsAsync();
        if (token !== generation) return;
        if (!permission.granted) throw new Error('Microphone or speech access is off. Enable it in device settings, or type your command.');
        const session = { callbacks, listeners: [] as { remove: () => void }[] };
        current = session;
        const active = () => token === generation && current === session;
        let delivered = false;
        session.listeners.push(speech.addListener('start', () => { if (active()) callbacks.onState(true); }));
        session.listeners.push(speech.addListener('end', () => { if (active()) release(); }));
        session.listeners.push(speech.addListener('error', event => {
          if (!active()) return;
          release();
          if (event.error !== 'aborted') callbacks.onError(event.message || 'Speech could not be recognized. Try again or type.');
        }));
        session.listeners.push(speech.addListener('result', event => {
          if (!active() || delivered || !event.results[0]?.transcript) return;
          if (event.isFinal) delivered = true;
          callbacks.onText(event.results[0].transcript, event.isFinal);
        }));
        speech.start({ lang: locale, interimResults: true, continuous: false, contextualStrings: ['chicken', 'olive oil', 'pesto', 'parmesan', 'kylling'] });
      } catch (error) {
        if (token !== generation) return;
        cancel();
        throw error;
      }
    },
    stop() { if (current) speech?.stop(); else cancel(); },
    cancel,
  };
}

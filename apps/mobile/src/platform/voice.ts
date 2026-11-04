import { requireOptionalNativeModule } from 'expo-modules-core';
import type { ExpoSpeechRecognitionModuleType } from 'expo-speech-recognition/build/ExpoSpeechRecognitionModule.types';
import { VoiceController } from './voice.types';
export function createVoiceController(): VoiceController {
  const speech = requireOptionalNativeModule<ExpoSpeechRecognitionModuleType>('ExpoSpeechRecognition');
  let cleanup = () => {}, cancelled = false;
  return {
    available: !!speech && speech.isRecognitionAvailable(),
    unavailable: speech ? 'Speech recognition is unavailable on this device. Use keyboard dictation or type below.' : 'Direct voice needs an iOS development build. In Expo Go, use the keyboard microphone in the command field.',
    async start(locale, callbacks) {
      if (!speech) throw new Error('Use keyboard dictation here, or open the app in a development build.');
      cleanup(); cancelled = false;
      const permission = await speech.requestPermissionsAsync();
      if (cancelled) return;
      if (!permission.granted) throw new Error('Microphone or speech access is off. Enable it in device settings, or type your command.');
      let delivered = false;
      const listeners = [
        speech.addListener('start', () => callbacks.onState(true)),
        speech.addListener('end', () => callbacks.onState(false)),
        speech.addListener('error', event => { if (!cancelled && event.error !== 'aborted') callbacks.onError(event.message || 'Speech could not be recognized. Try again or type.'); callbacks.onState(false); }),
        speech.addListener('result', event => { if (!cancelled && !delivered && event.results[0]?.transcript) { if (event.isFinal) delivered = true; callbacks.onText(event.results[0].transcript, event.isFinal); } }),
      ];
      cleanup = () => listeners.forEach(listener => listener.remove());
      speech.start({ lang: locale, interimResults: true, continuous: false, contextualStrings: ['chicken', 'olive oil', 'pesto', 'parmesan', 'kylling'] });
    },
    stop() { speech?.stop(); },
    cancel() { cancelled = true; cleanup(); speech?.abort(); },
  };
}

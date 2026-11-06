import { requireOptionalNativeModule } from 'expo-modules-core';
import type { ExpoSpeechRecognitionModuleType } from 'expo-speech-recognition/build/ExpoSpeechRecognitionModule.types';
import { createNativeVoiceController } from './nativeVoice';

export function createVoiceController() {
  return createNativeVoiceController(requireOptionalNativeModule<ExpoSpeechRecognitionModuleType>('ExpoSpeechRecognition'));
}

import { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

export function EntryFrame({ children }: PropsWithChildren) {
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>{children}</KeyboardAvoidingView>;
}

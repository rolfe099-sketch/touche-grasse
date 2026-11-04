import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Keyboard, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { createVoiceController } from '../platform/voice';
import { Text, TextInput } from './Text';
import { SegmentButton, TextButton } from './components';
import { colors } from './theme';
import { ListeningActivity, Reveal } from './Motion';

export type EntryMethod = 'text' | 'voice' | 'scan';
export function VoiceEntry({ onCommand, disabled, mode, onMode, onReview, onType, commandsOpen, onCommands, autoStart = false, children }: {
  onCommand: (command: string) => boolean; disabled: boolean; mode: EntryMethod; onMode: (mode: EntryMethod) => void;
  onReview: () => void; onType: () => void; commandsOpen: boolean; onCommands: (open: boolean) => void; autoStart?: boolean; children?: ReactNode;
}) {
  const voice = useMemo(createVoiceController, []), command = useRef(onCommand); command.current = onCommand;
  const [listening, setListening] = useState(false), [starting, setStarting] = useState(false);
  const [text, setText] = useState(''), [error, setError] = useState(''), [locale, setLocale] = useState<'en-US' | 'nb-NO'>('en-US');
  const expanded = mode === 'voice' || commandsOpen;
  useFocusEffect(useCallback(() => () => { voice.cancel(); setListening(false); }, [voice]));
  useEffect(() => {
    // A first-use permission prompt can temporarily make iOS inactive.
    // Cancel established capture on interruption, but let that prompt finish.
    const subscription = AppState.addEventListener('change', state => { if (state === 'background' || (state === 'inactive' && listening)) { voice.cancel(); setListening(false); } });
    return () => subscription.remove();
  }, [voice, listening]);
  function review() { voice.cancel(); setListening(false); onCommands(false); onReview(); }
  function apply(value: string) {
    if (!value.trim() || !command.current(value)) return;
    setText(''); Keyboard.dismiss(); review();
  }
  async function start() {
    Keyboard.dismiss(); onMode('voice'); onCommands(false); setError('');
    if (listening) { voice.stop(); return; }
    if (!voice.available) return;
    setStarting(true);
    try { await voice.start(locale, { onState: setListening, onError: setError, onText(value, final) { setText(value); if (final) apply(value); } }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Voice could not start.'); }
    finally { setStarting(false); }
  }
  const startRef = useRef(start); startRef.current = start;
  const started = useRef(false);
  useEffect(() => { if (autoStart && !started.current) { started.current = true; void startRef.current(); } }, [autoStart]);
  useEffect(() => { if (mode !== 'voice') { voice.cancel(); setListening(false); } }, [mode, voice]);
  return <View style={{ marginBottom: 8, borderRadius: 10, borderWidth: 1, borderColor: listening ? colors.copper : colors.line, backgroundColor: colors.surface, overflow: 'hidden' }}>
    {!expanded && mode !== 'scan' && children}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 5, borderTopWidth: expanded || mode === 'scan' ? 0 : 1, borderColor: colors.line }}>
      <SegmentButton label="Type" accessibilityLabel="Type a meal" icon="type" selected={mode === 'text' && !commandsOpen} disabled={disabled} onPress={() => { review(); onMode('text'); onType(); }} />
      <SegmentButton testID="voice-start" label={starting ? 'Starting...' : listening ? 'Stop' : 'Voice'} accessibilityLabel={listening ? 'Stop listening' : 'Speak a command'} icon={listening ? 'wave' : 'mic'} selected={mode === 'voice'} active={listening} disabled={disabled || starting} onPress={() => void start()} />
      <SegmentButton label="Scan" accessibilityLabel="Scan a barcode" icon="camera" selected={mode === 'scan'} disabled={disabled} onPress={() => { voice.cancel(); setListening(false); onCommands(false); Keyboard.dismiss(); onMode('scan'); }} />
    </View>
    {expanded && <Reveal><View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: colors.secondary, fontSize: 13 }}>{listening ? 'Listening...' : 'Add, correct or prepare a meal'}</Text><TextButton label={locale === 'en-US' ? 'EN' : 'NO'} accessibilityLabel="Change voice language" onPress={() => { voice.cancel(); setLocale(locale === 'en-US' ? 'nb-NO' : 'en-US'); }} disabled={listening || starting} /></View>
      <ListeningActivity active={listening} /><TextInput testID="voice-command" accessibilityLabel="Meal command" placeholder="Add 200 grams of chicken..." value={text} onChangeText={setText} multiline submitBehavior="submit" onSubmitEditing={() => apply(text)} editable={!disabled && !listening} returnKeyType="go" style={{ minHeight: 58, maxHeight: 100, fontSize: 18, lineHeight: 25, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 8 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ color: colors.secondary, fontSize: 12, flex: 1 }}>Try: Change chicken to 250g</Text><TextButton label="Apply" accessibilityLabel="Apply meal command" disabled={disabled || listening || !text.trim()} onPress={() => apply(text)} /></View>
      {!voice.available && mode === 'voice' && <Text style={{ color: colors.secondary, fontSize: 12 }}>{voice.unavailable}</Text>}
      {!!error && <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 13, marginTop: 7 }}>{error}</Text>}
      <TextButton label="Back to ingredients" accessibilityLabel="Hide commands" onPress={review} />
    </View></Reveal>}
  </View>;
}

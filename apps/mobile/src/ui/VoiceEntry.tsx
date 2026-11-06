import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Keyboard, Linking, Platform, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { createVoiceController } from '../platform/voice';
import { Text, TextInput } from './Text';
import { SegmentButton, TextButton } from './components';
import { colors } from './theme';
import { ListeningActivity, Reveal } from './Motion';
import { useApp } from '../state/AppContext';
import { VoiceDraft } from '../domain/quickEntry';

export type EntryMethod = 'text' | 'voice' | 'scan';
export function VoiceEntry({ onCommand, disabled, mode, onMode, onReview, onType, commandsOpen, onCommands, autoStart = false, children }: {
  onCommand: (command: string, voiceId: string) => Promise<boolean>; disabled: boolean; mode: EntryMethod; onMode: (mode: EntryMethod) => void;
  onReview: () => void; onType: () => void; commandsOpen: boolean; onCommands: (open: boolean) => void; autoStart?: boolean; children?: ReactNode;
}) {
  const app = useApp(), save = useRef(app.saveVoiceDraft); save.current = app.saveVoiceDraft;
  const voice = useMemo(createVoiceController, []), command = useRef(onCommand); command.current = onCommand;
  const [listening, setListening] = useState(false), [starting, setStarting] = useState(false), [submitting, setSubmitting] = useState(false);
  const retained = useRef<VoiceDraft | null>(app.repo.quickEntry.voiceDraft ?? null);
  const [text, setText] = useState(retained.current?.text ?? ''), [error, setError] = useState(''), [locale, setLocale] = useState<'en-US' | 'nb-NO'>(retained.current?.locale ?? app.repo.quickEntry.voiceLocale ?? 'en-US');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), generation = useRef(0), applying = useRef(false);
  const expanded = mode === 'voice' || commandsOpen;
  function persist(draft = retained.current) {
    clearTimeout(timer.current);
    if (!draft) return Promise.resolve();
    return save.current(draft);
  }
  function retain(value: string, language = locale, id = retained.current?.id ?? app.repo.id()) {
    const draft = { id, text: value, locale: language }; retained.current = draft; setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void persist(draft).catch(() => setError('Command not saved. Keep this open and tap Apply to retry.')); }, 250);
    return draft;
  }
  function cancel() { generation.current++; voice.cancel(); setListening(false); setStarting(false); void persist().catch(() => setError('Command not saved. Tap Apply to retry.')); }
  const cancelRef = useRef(cancel); cancelRef.current = cancel;
  useFocusEffect(useCallback(() => () => cancelRef.current(), []));
  useEffect(() => {
    // Permission prompts may make iOS inactive; established capture is interrupted.
    const subscription = AppState.addEventListener('change', state => { if (state === 'background' || (state === 'inactive' && (listening || applying.current))) cancelRef.current(); });
    return () => subscription.remove();
  }, [listening]);
  function review() { cancel(); onCommands(false); onReview(); }
  async function apply(value: string, draft = retained.current, capture?: number) {
    if (!value.trim() || applying.current || disabled) return;
    applying.current = true; setSubmitting(true); setError('');
    try {
      const pending = draft?.text === value ? draft : retain(value);
      await persist(pending);
      // Automatic speech must still belong to the foreground capture after the
      // async draft save. Keep interrupted text for an explicit resume instead.
      if (capture !== undefined && (capture !== generation.current || AppState.currentState !== 'active')) return;
      if (!await command.current(value, pending.id)) return;
      // The repository acknowledges this exact transcript in the food transaction.
      if (retained.current?.id === pending.id) { retained.current = null; setText(''); }
      Keyboard.dismiss(); review();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Command not saved. Tap Apply to retry.'); }
    finally { applying.current = false; setSubmitting(false); }
  }
  async function start() {
    Keyboard.dismiss(); onMode('voice'); onCommands(false); setError('');
    if (listening) { voice.stop(); return; }
    if (!voice.available || applying.current) return;
    const capture = ++generation.current, captureId = app.repo.id(); setStarting(true);
    try { await voice.start(locale, {
      onState(value) { if (capture === generation.current) setListening(value); },
      onError(value) { if (capture === generation.current) { cancelRef.current(); setError(value); } },
      onText(value, final) {
        if (capture !== generation.current) return;
        if (value.length > 12000) { cancel(); setError('Command too long. Use a shorter command.'); return; }
        const draft = retain(value, locale, captureId); if (final) void apply(value, draft, capture);
      },
    }); }
    catch (reason) { if (capture === generation.current) { cancelRef.current(); setError(reason instanceof Error ? reason.message : 'Voice could not start.'); } }
    finally { if (capture === generation.current) setStarting(false); }
  }
  const startRef = useRef(start); startRef.current = start;
  const started = useRef(false);
  useEffect(() => { if (autoStart && !started.current) { started.current = true; void startRef.current(); } }, [autoStart]);
  useEffect(() => { if (mode !== 'voice') cancelRef.current(); }, [mode]);
  return <View style={{ marginBottom: 8, borderRadius: 10, borderWidth: 1, borderColor: listening ? colors.copper : colors.line, backgroundColor: colors.surface, overflow: 'hidden' }}>
    {!expanded && mode !== 'scan' && children}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 5, borderTopWidth: expanded || mode === 'scan' ? 0 : 1, borderColor: colors.line }}>
      <SegmentButton label="Type" accessibilityLabel="Type a meal" icon="type" selected={mode === 'text' && !commandsOpen} disabled={disabled || submitting} onPress={() => { review(); onMode('text'); onType(); }} />
      <SegmentButton testID="voice-start" label={starting ? 'Starting...' : listening ? 'Stop' : 'Voice'} accessibilityLabel={listening ? 'Stop listening' : 'Speak a command'} icon={listening ? 'wave' : 'mic'} selected={mode === 'voice'} active={listening} disabled={disabled || submitting || starting} onPress={() => void start()} />
      <SegmentButton label="Scan" accessibilityLabel="Scan a barcode" icon="camera" selected={mode === 'scan'} disabled={disabled || submitting} onPress={() => { cancel(); onCommands(false); Keyboard.dismiss(); onMode('scan'); }} />
    </View>
    {!expanded && !!text.trim() && <View style={{ paddingHorizontal: 14 }}><TextButton label="Continue voice command" onPress={() => { cancel(); onCommands(true); }} /></View>}
    {expanded && <Reveal><View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: colors.secondary, fontSize: 13 }}>{listening ? 'Listening...' : 'Add, correct or prepare a meal'}</Text><TextButton label={locale === 'en-US' ? 'EN' : 'NO'} accessibilityLabel="Change voice language" onPress={() => { cancel(); const next = locale === 'en-US' ? 'nb-NO' : 'en-US'; setLocale(next); retain(text, next); }} disabled={listening || starting || submitting} /></View>
      <ListeningActivity active={listening} /><TextInput testID="voice-command" accessibilityLabel="Meal command" placeholder="Add 200 grams of chicken..." value={text} onChangeText={value => retain(value)} maxLength={12000} multiline submitBehavior="submit" onSubmitEditing={() => void apply(text)} editable={!disabled && !listening && !submitting} returnKeyType="go" style={{ minHeight: 58, maxHeight: 100, fontSize: 18, lineHeight: 25, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 8 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ color: colors.secondary, fontSize: 12, flex: 1 }}>Try: Change chicken to 250g</Text><TextButton label="Apply" accessibilityLabel="Apply meal command" disabled={disabled || submitting || listening || !text.trim()} onPress={() => void apply(text)} /></View>
      {!voice.available && mode === 'voice' && <Text style={{ color: colors.secondary, fontSize: 12 }}>{voice.unavailable}</Text>}
      {!!error && <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 13, marginTop: 7 }}>{error}</Text>}
      {Platform.OS !== 'web' && error.includes('access is off') && <TextButton label="Open device settings" onPress={() => void Linking.openSettings().catch(() => setError('Open Settings on your phone to enable microphone and speech access.'))} />}
      <TextButton label="Back to ingredients" accessibilityLabel="Hide commands" onPress={review} />
    </View></Reveal>}
  </View>;
}

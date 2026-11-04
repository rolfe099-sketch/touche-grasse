import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Image, Platform, Pressable, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { LabelCandidate, parseNutritionLabel } from '../domain/nutritionLabel';
import { createLabelOCR, pickLabelPhoto } from '../platform/labelPhoto';
import { createLabelSession } from '../platform/labelSession';
import { Button, TextButton } from './components';
import { Text } from './Text';
import { colors } from './theme';
export function LabelPhotoInput({ onRead, onBusy, disabled, hasReview, captureIntent, onCaptureConsumed }: { onRead: (candidate: LabelCandidate) => void; onBusy: (busy: boolean) => void; disabled: boolean; hasReview: boolean; captureIntent?: string; onCaptureConsumed?: () => void }) {
  const [busy, setBusy] = useState(false), [photo, setPhoto] = useState<string>(), [error, setError] = useState('');
  const [large, setLarge] = useState(false), [focused, setFocused] = useState(false);
  const consumed = useRef<string | undefined>(undefined);
  const callbacks = useRef({ onRead, onBusy }); callbacks.current = { onRead, onBusy };
  const ocr = useMemo(createLabelOCR, []);
  const session = useMemo(() => createLabelSession({ pick: pickLabelPhoto, recognize: ocr.recognize }, {
    state(value) { setBusy(value); callbacks.current.onBusy(value); }, photo: setPhoto,
    result(document) { callbacks.current.onRead(parseNutritionLabel(document)); }, error: setError,
  }), [ocr]);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    const subscription = AppState.addEventListener('change', state => { if (state === 'background') session.cancel(); });
    return () => { setFocused(false); subscription.remove(); session.cancel(); };
  }, [session]));
  useEffect(() => {
    if (!focused || !captureIntent || consumed.current === captureIntent || disabled) return;
    consumed.current = captureIntent; onCaptureConsumed?.();
    if (Platform.OS !== 'web' && ocr.available) { setError(''); void session.start('camera'); }
  }, [focused, captureIntent, disabled, onCaptureConsumed, ocr, session]);
  return <View testID="label-photo" style={{ marginBottom: 10, gap: 6 }}>
    <View style={{ flexDirection: 'row', gap: 8 }}>{Platform.OS !== 'web' && <Button label="Take label photo" icon="photo" compact disabled={disabled || busy || !ocr.available} onPress={() => { setError(''); void session.start('camera'); }} />}<Button label="Choose label photo" icon="photo" compact disabled={disabled || busy || !ocr.available} onPress={() => { setError(''); void session.start('library'); }} />{busy && <TextButton label="Cancel scan" onPress={session.cancel} />}</View>
    {photo && <Pressable accessibilityRole="button" accessibilityLabel={large ? 'Collapse label photo' : 'Enlarge label photo'} onPress={() => setLarge(!large)}><Image accessibilityLabel="Nutrition label being reviewed" source={{ uri: photo }} resizeMode="contain" style={{ width: '100%', height: large ? 360 : 145, backgroundColor: colors.surface, borderRadius: 5 }} /><Text style={{ fontSize: 11, color: colors.action, marginTop: 3 }}>{large ? 'Collapse photo' : 'Tap to enlarge'}</Text></Pressable>}
    {hasReview && !photo && !busy && <Text style={{ fontSize: 12, color: colors.secondary }}>Scan text retained. Compare with the package or choose its photo again.</Text>}
    {busy && <Text accessibilityLiveRegion="polite" style={{ fontSize: 13, color: colors.secondary }}>Reading label on this device…</Text>}
    {!ocr.available && <Text style={{ fontSize: 12, color: colors.secondary }}>{ocr.unavailable}</Text>}
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 13 }}>{error}</Text>}
    <Text style={{ fontSize: 11, color: colors.secondary }}>Photograph the nutrition table straight on.{Platform.OS !== 'web' ? ' Press the shutter, then Use Photo.' : ' The first scan downloads local OCR files.'} Photos stay on this device.</Text>
  </View>;
}

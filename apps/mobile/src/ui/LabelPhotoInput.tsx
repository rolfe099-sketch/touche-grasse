import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Image, Platform, Pressable, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { LabelCandidate, parseNutritionLabel } from '../domain/nutritionLabel';
import { createLabelOCR, pickLabelPhoto, transformLabelPhoto } from '../platform/labelPhoto';
import { createLabelSession } from '../platform/labelSession';
import { Button, TextButton } from './components';
import { Text } from './Text';
import { colors } from './theme';
import { fullLabelImage, LabelImageEdit } from '../domain/labelImage';
import { LabelPhotoView } from '../platform/labelPhoto.types';
import { LabelPhotoEditor } from './LabelPhotoEditor';
export function LabelPhotoInput({ onRead, onBusy, onPhoto, disabled, hasReview, captureIntent, onCaptureConsumed }: { onRead: (candidate: LabelCandidate, photo?: string) => void; onBusy: (busy: boolean) => void; onPhoto?: (uri?: string) => void; disabled: boolean; hasReview: boolean; captureIntent?: string; onCaptureConsumed?: () => void }) {
  const [busy, setBusy] = useState(false), [photo, setPhoto] = useState<string>(), [error, setError] = useState('');
  const [large, setLarge] = useState(false), [focused, setFocused] = useState(false), [editing, setEditing] = useState(false), [original, setOriginal] = useState<LabelPhotoView>();
  const [edit, setEdit] = useState<LabelImageEdit>(fullLabelImage), currentPhoto = useRef<string | undefined>(undefined);
  const consumed = useRef<string | undefined>(undefined);
  const callbacks = useRef({ onRead, onBusy, onPhoto }); callbacks.current = { onRead, onBusy, onPhoto };
  const ocr = useMemo(createLabelOCR, []);
  const session = useMemo(() => createLabelSession({ pick: pickLabelPhoto, recognize: ocr.recognize, transform: transformLabelPhoto }, {
    state: setBusy,
    photo(uri) { currentPhoto.current = uri; setPhoto(uri); callbacks.current.onPhoto?.(uri); },
    source(value) { setOriginal(value); setEditing(false); setEdit(fullLabelImage()); },
    result(document) { callbacks.current.onRead(parseNutritionLabel(document), currentPhoto.current); }, error: setError,
  }), [ocr]);
  useEffect(() => { callbacks.current.onBusy(busy || editing); }, [busy, editing]);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    const subscription = AppState.addEventListener('change', state => { if (state === 'background') session.stop(); });
    return () => { setFocused(false); subscription.remove(); session.cancel(); };
  }, [session]));
  useEffect(() => {
    if (!focused || !captureIntent || consumed.current === captureIntent || disabled) return;
    consumed.current = captureIntent; onCaptureConsumed?.();
    if (Platform.OS !== 'web' && ocr.available) { setError(''); void session.start('camera'); }
  }, [focused, captureIntent, disabled, onCaptureConsumed, ocr, session]);
  return <View testID="label-photo" style={{ marginBottom: 10, gap: 6 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{Platform.OS !== 'web' && <Button label="Take label photo" icon="photo" compact disabled={disabled || busy || !ocr.available} onPress={() => { setError(''); void session.start('camera'); }} />}<Button label="Choose label photo" icon="photo" compact disabled={disabled || busy || !ocr.available} onPress={() => { setError(''); void session.start('library'); }} />{busy && <TextButton label="Cancel scan" onPress={session.stop} />}</View>
    {photo && !editing && <Pressable accessibilityRole="button" accessibilityLabel={large ? 'Collapse label photo' : 'Enlarge label photo'} onPress={() => setLarge(!large)}><Image accessibilityLabel="Latest nutrition label photo" source={{ uri: photo }} resizeMode="contain" style={{ width: '100%', height: large ? 360 : 120, backgroundColor: colors.surface, borderRadius: 5 }} /><Text style={{ fontSize: 11, color: colors.action, marginTop: 3 }}>{large ? 'Collapse photo' : 'Tap to enlarge'}</Text></Pressable>}
    {original && !editing && <TextButton label="Crop / rotate" accessibilityLabel="Crop or rotate label photo" disabled={disabled || busy} onPress={() => setEditing(true)} />}
    {original && editing && <LabelPhotoEditor photo={original} initial={edit} busy={busy || disabled} onApply={value => { setEdit(value); setEditing(false); setError(''); void session.adjust(value); }} onCancel={() => setEditing(false)} />}
    {hasReview && !photo && !busy && <Text style={{ fontSize: 12, color: colors.secondary }}>Scan text retained. Compare with the package or choose its photo again.</Text>}
    {busy && <Text accessibilityLiveRegion="polite" style={{ fontSize: 13, color: colors.secondary }}>Reading label on this device…</Text>}
    {!ocr.available && <Text style={{ fontSize: 12, color: colors.secondary }}>{ocr.unavailable}</Text>}
    {!!error && <View><Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 13 }}>{error}</Text>{hasReview && <Text style={{ color: colors.secondary, fontSize: 12 }}>Existing label values are kept.</Text>}{original && <TextButton label="Read this photo again" disabled={disabled || busy || editing} onPress={() => { setError(''); void session.adjust(edit); }} />}</View>}
    <Text style={{ fontSize: 11, color: colors.secondary }}>Photograph the nutrition table straight on.{Platform.OS !== 'web' ? ' Press the shutter, then Use Photo.' : ' The first scan downloads local OCR files.'} Photos stay on this device.</Text>
  </View>;
}

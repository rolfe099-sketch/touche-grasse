import { useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { LabelReviewTarget } from '../domain/labelDrafts';
import { Icon } from './Icon';
import { Text } from './Text';
import { TextButton } from './components';
import { colors } from './theme';

export function LabelDraftResume({ reviews, disabled }: { reviews: LabelReviewTarget[]; disabled: boolean }) {
  const [all, setAll] = useState(false);
  if (!reviews.length) return null;
  return <View testID="label-draft-resume" style={{ borderBottomWidth: 1, borderColor: colors.line, marginBottom: 10, paddingBottom: 5 }}>
    {reviews.slice(0, all ? undefined : 3).map((review, index) => <Pressable key={review.key} accessibilityRole="button" accessibilityLabel={reviews.length === 1 ? 'Continue label review' : `Continue label review ${index + 1}`} disabled={disabled} onPress={() => { Keyboard.dismiss(); router.push({ pathname: '/manual', params: review.params }); }} style={({ pressed }) => ({ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, opacity: pressed || disabled ? .6 : 1 })}>
      <Icon name="photo" size={21} /><View style={{ flex: 1, gap: 3 }}><Text style={{ fontSize: 14, fontWeight: '600', color: colors.action }}>Continue label review</Text><Text numberOfLines={1} style={{ fontSize: 12, color: colors.secondary }}>{review.form.name.trim() || (review.form.barcode ? `Barcode ${review.form.barcode}` : review.form.scan ? 'Scanned label' : 'Unfinished food')}</Text></View><Icon name="next" size={16} />
    </Pressable>)}
    {reviews.length > 3 && <TextButton label={all ? 'Show fewer labels' : `Show all unfinished labels (${reviews.length})`} onPress={() => setAll(!all)} />}
  </View>;
}

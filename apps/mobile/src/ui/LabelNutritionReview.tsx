import { ReactNode, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { nutrients } from '../domain/model';
import { LabelForm, labelColumnSchema } from '../domain/nutritionLabel';
import { z } from 'zod';
import { Field, TextButton } from './components';
import { Text } from './Text';
import { colors } from './theme';

type Nutrient = typeof nutrients[number];
const names = ['Energy', 'Protein', 'Carbs', 'Fat', 'Fiber'];
export function LabelNutritionReview({ values, selected, photo, disabled, onChange, children }: { values: LabelForm['values']; selected?: z.infer<typeof labelColumnSchema>; photo?: string; disabled: boolean; onChange: (key: Nutrient, value: string) => void; children?: ReactNode }) {
  const [comparing, setComparing] = useState(false), [active, setActive] = useState<Nutrient>('kcal'), [zoom, setZoom] = useState(1), [width, setWidth] = useState(330);
  const compare = !!photo && comparing;
  function field(key: Nutrient, index: number) {
    return <View key={key} style={{ width: compare ? '100%' : '48%' }}>
      <Field key={`${compare ? 'compare' : 'grid'}-${key}`} compact label={`${names[index]} · ${key === 'kcal' ? 'kcal' : 'g'}`} value={values[key]} onChangeText={value => onChange(key, value)} keyboardType="decimal-pad" selectTextOnFocus maxLength={100} editable={!disabled} autoFocus={compare} placeholder={selected?.suggestions?.[key] ? 'Confirm unit' : 'Unknown'} />
      {compare && selected?.evidence[key] && !selected.issues[key] && <Text selectable style={{ fontSize: 12, color: colors.secondary, marginBottom: 4 }}>Read: {selected.evidence[key].replace(/\s+/g, ' ').trim()}</Text>}
      {selected?.nutrition[key] != null && values[key] !== selected.nutrition[key] && <TextButton label={`Use photo: ${selected.nutrition[key]} ${key === 'kcal' ? 'kcal' : 'g'}`} accessibilityLabel={`Use new reading for ${key}`} disabled={disabled} onPress={() => onChange(key, selected.nutrition[key]!)} />}
      {selected?.issues[key] && !values[key] && <Text style={{ fontSize: 11, color: colors.error, marginBottom: 4 }}>{selected.issues[key]}</Text>}
      {selected?.issues[key] && !values[key] && selected.evidence[key] && <Text selectable style={{ fontSize: 11, color: colors.secondary, marginBottom: 6 }}>Read: {selected.evidence[key].replace(/\s+/g, ' ').trim()}</Text>}
      {selected?.suggestions?.[key] && !values[key] && <TextButton label={selected.amount === '100' ? `Confirm ${selected.suggestions[key]} g` : 'Confirm grams'} accessibilityLabel={`Confirm label ${key} in grams`} disabled={disabled} onPress={() => onChange(key, selected.suggestions![key])} />}
    </View>;
  }
  return <View testID="label-nutrition-review" style={{ gap: 4 }} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    {photo && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><TextButton label={compare ? 'All values' : 'Compare with photo'} disabled={disabled} onPress={() => {
      if (!compare) setActive(nutrients.find(key => !values[key]) ?? 'kcal'); setComparing(!compare);
    }} />{compare && <TextButton label={zoom === 1 ? 'Zoom photo' : 'Fit photo'} onPress={() => setZoom(zoom === 1 ? 2 : 1)} />}</View>}
    {compare && <View testID="label-photo-comparison" style={{ gap: 4 }}>
      {selected && <Text style={{ fontSize: 12, color: colors.secondary }}>Values per 100 {selected.unit}{selected.amount !== '100' ? ` · normalized from ${selected.amount} ${selected.unit}` : ''}{selected.prepared ? ' · prepared' : ''}</Text>}
      <ScrollView horizontal style={{ height: 220, backgroundColor: colors.surface }} nestedScrollEnabled contentContainerStyle={{ width: width * zoom }}>
        <ScrollView style={{ width: width * zoom, height: 220 }} nestedScrollEnabled><Image accessibilityLabel="Photo matching these label readings" source={{ uri: photo }} resizeMode="contain" style={{ width: width * zoom, height: 220 * zoom }} /></ScrollView>
      </ScrollView>
      <View style={{ flexDirection: 'row' }}>{nutrients.map((key, index) => <Pressable key={key} accessibilityRole="button" accessibilityLabel={`Compare label ${names[index].toLowerCase()}`} accessibilityState={{ selected: active === key }} disabled={disabled} onPress={() => setActive(key)} style={({ pressed }) => ({ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: active === key ? 2 : 1, borderColor: active === key ? colors.copper : colors.line, backgroundColor: pressed ? colors.pressed : 'transparent' })}><Text style={{ fontSize: 12, color: active === key ? colors.action : colors.secondary }}>{names[index]}</Text></Pressable>)}</View>
    </View>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>{compare ? field(active, nutrients.indexOf(active)) : nutrients.map(field)}{children && <View style={{ width: compare ? '100%' : '48%' }}>{children}</View>}</View>
  </View>;
}

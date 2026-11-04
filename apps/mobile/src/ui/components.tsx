import React from 'react';
import { Pressable, ScrollView, StyleSheet, TextInputProps, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { D, display, Food, Nutrition, nutrients } from '../domain/model';
import { useApp } from '../state/AppContext';
import { Icon, IconName } from './Icon';
import { colors, numeric, serif } from './theme';
import { Text, TextInput } from './Text';
import { Reveal, useReducedMotion } from './Motion';
import { SupportButton } from './SupportButton';
import { foodLabel } from '../domain/foodLanguage';

export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  container: { width: '100%', maxWidth: 700, alignSelf: 'center', flex: 1 },
  content: { paddingHorizontal: 22, paddingBottom: 28 },
  header: { paddingHorizontal: 22, paddingTop: 13, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: colors.ink, fontSize: 34, fontWeight: '600', lineHeight: 38, letterSpacing: -1.1 },
  subtitle: { fontSize: 14, lineHeight: 20, color: colors.secondary },
  label: { color: colors.secondary, fontFamily: numeric, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 5, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.line },
  body: { color: colors.ink, fontSize: 16, lineHeight: 23 },
  foodName: { color: colors.ink, fontSize: 16, lineHeight: 21, fontWeight: '600' },
  input: { minHeight: 46, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 10, color: colors.ink, fontSize: 16, fontFamily: numeric },
  numeric: { fontFamily: numeric, fontVariant: ['tabular-nums'] },
  field: { gap: 6, marginBottom: 14 },
});
export function Button({ label, accessibilityLabel, onPress, icon, primary = false, selected, disabled = false, testID, compact = false }: {
  label: string; accessibilityLabel?: string; onPress: () => void; icon?: IconName; primary?: boolean; selected?: boolean; disabled?: boolean; testID?: string; compact?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const foreground = disabled ? colors.secondary : primary ? colors.onPrimary : selected ? colors.action : colors.ink;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }} aria-pressed={selected} disabled={disabled} testID={testID} onPress={onPress}
    style={({ pressed }) => ({ minHeight: compact ? 44 : 48, paddingHorizontal: compact ? 12 : 18, paddingVertical: 10, borderRadius: compact ? 10 : 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: compact ? 6 : 8, backgroundColor: disabled ? colors.surface : primary ? pressed ? colors.primaryPressed : colors.primary : pressed ? colors.pressed : selected ? colors.selection : colors.raised, transform: [{ scale: pressed && !reducedMotion ? .985 : 1 }], opacity: disabled ? .65 : 1, borderWidth: selected ? 1 : 0, borderColor: selected ? colors.action : 'transparent' })}>
    {icon && <Icon name={icon} size={compact ? 16 : 19} color={foreground} />}
    <Text style={{ color: foreground, fontWeight: '600', fontSize: compact ? 14 : 16, lineHeight: compact ? 20 : 22 }}>{label}</Text>
  </Pressable>;
}
export function SegmentButton({ label, accessibilityLabel, selected, onPress, disabled = false, icon, active = false, testID }: { label: string; accessibilityLabel?: string; selected: boolean; onPress: () => void; disabled?: boolean; icon?: IconName; active?: boolean; testID?: string }) {
  const foreground = active ? colors.onPrimary : selected ? colors.ink : colors.secondary;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ selected, disabled }} aria-pressed={selected} testID={testID} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ flex: 1, minHeight: 44, paddingHorizontal: 4, borderRadius: 8, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? colors.primary : pressed ? colors.pressed : selected ? colors.raised : 'transparent', opacity: disabled ? .45 : 1 })}>
    {icon && <Icon name={icon} size={18} color={foreground} />}<Text style={{ fontSize: 14, lineHeight: 20, fontWeight: selected ? '600' : '400', color: foreground }}>{label}</Text>
  </Pressable>;
}
export function TextButton({ label, accessibilityLabel, onPress, disabled = false }: { label: string; accessibilityLabel?: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ minHeight: 44, minWidth: 44, justifyContent: 'center', borderRadius: 8, backgroundColor: pressed ? colors.selection : 'transparent', opacity: disabled ? 0.4 : 1 })}><Text style={{ color: colors.action, fontWeight: '600', fontSize: 14 }}>{label}</Text></Pressable>;
}
export function IconButton({ name, label, onPress, disabled = false, testID, filled = false, destructive = false }: { name: IconName; label: string; onPress: () => void; disabled?: boolean; testID?: string; filled?: boolean; destructive?: boolean }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} testID={testID}
    style={({ pressed }) => ({ width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: filled ? 10 : 22, backgroundColor: pressed ? colors.pressed : filled ? colors.raised : 'transparent', opacity: disabled ? 0.3 : 1 })}><Icon name={name} size={20} color={destructive ? colors.error : filled ? colors.ink : colors.action} /></Pressable>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={styles.field}><Text style={{ fontSize: 13, fontWeight: '600', color: colors.secondary }}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={colors.secondary} {...props} style={[styles.input, props.style]} /></View>;
}
export function Section({ title, children }: { title: string; children?: React.ReactNode }) {
  return <View style={styles.section}><Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: '700', letterSpacing: -0.2, color: colors.ink }}>{title}</Text>{children}</View>;
}
export function Feedback() {
  const app = useApp();
  return <>
    {app.error && <View style={{ backgroundColor: colors.errorSurface, paddingLeft: 14, marginHorizontal: 22, marginBottom: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center' }}>
      <Text accessibilityRole="alert" style={{ flex: 1, color: colors.error, fontSize: 14, lineHeight: 20, paddingVertical: 10 }}>{app.error}</Text><IconButton name="close" label="Dismiss error" onPress={app.clearError} />
    </View>}
    {app.notice && <Reveal trigger={app.notice} style={{ backgroundColor: colors.selection, paddingLeft: 14, marginHorizontal: 22, marginBottom: 10, borderRadius: 10, flexDirection: 'row', alignItems: 'center' }}>
      <Text accessibilityLiveRegion="polite" style={{ flex: 1, color: colors.action, fontSize: 14, paddingVertical: 8 }}>{app.notice}</Text>
      {!!app.repo.undo.length && <Pressable accessibilityRole="button" accessibilityLabel={app.repo.undoLabel} disabled={app.busy} onPress={() => void app.run(() => app.repo.undoLast(), app.repo.undoNotice)} style={{ padding: 12, minHeight: 44 }}><Text style={{ color: colors.action, fontWeight: '700' }}>Undo</Text></Pressable>}
      <IconButton name="close" label="Dismiss notification" onPress={app.clearNotice} />
    </Reveal>}
  </>;
}
export function Screen({ title, eyebrow, children, scroll = true, back = false, trailing, brand = false, testID, footer, header, support = false, keyboardInsets = true }: { title: string; eyebrow?: string; children: React.ReactNode; scroll?: boolean; back?: boolean; trailing?: React.ReactNode; brand?: boolean; testID?: string; footer?: React.ReactNode; header?: React.ReactNode; support?: boolean; keyboardInsets?: boolean }) {
  return <SafeAreaView testID={testID} style={styles.page} edges={back ? ['top', 'left', 'right', 'bottom'] : ['top', 'left', 'right']}><View style={styles.container}>
    <View style={styles.header}>{header ?? <>{back && <IconButton name="back" label="Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />}
      {brand && <Icon name="brand" size={31} />}
      <View style={{ flex: 1, gap: 4 }}>{eyebrow && <Text style={styles.label}>{eyebrow}</Text>}<Text accessibilityRole="header" style={brand ? { fontFamily: serif, fontSize: 29, lineHeight: 34, letterSpacing: -0.8, fontWeight: '600' } : styles.title}>{title}</Text></View>{trailing}</>}{support && <SupportButton />}</View>
    <Feedback />
    {scroll ? <ScrollView automaticallyAdjustKeyboardInsets={keyboardInsets} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={styles.content}>{children}</ScrollView> : children}
    {footer && <View testID="screen-footer" style={{ paddingHorizontal: 22, paddingTop: 10, paddingBottom: 12, backgroundColor: colors.night, borderTopWidth: 1, borderColor: colors.line }}>{footer}</View>}
  </View></SafeAreaView>;
}
export function NutritionView({ value, large = false, caption = 'kcal', empty = false }: { value: Nutrition; large?: boolean; caption?: string; empty?: boolean }) {
  const weights = ['protein', 'carbohydrate', 'fat'].map((key, i) => value[key as keyof Nutrition] === null ? null : new D(value[key as keyof Nutrition]!).times(i === 2 ? 9 : 4));
  let all = new D(0); for (const value of weights) all = all.plus(value ?? 0);
  return <View style={{ paddingTop: large ? 12 : 5, paddingBottom: 17 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View><View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 9 }}>
        <Text style={{ color: colors.ink, fontSize: large ? 64 : 36, lineHeight: large ? 72 : 43, fontWeight: '600', fontVariant: ['tabular-nums'], letterSpacing: -2.5 }} testID="nutrition-kcal">{empty ? '–' : display(value.kcal, 0)}</Text><Text style={styles.subtitle}>{caption}</Text>
      </View></View>
    </View>
    <View style={{ flexDirection: 'row', height: large ? 7 : 4, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.line, marginTop: 19, marginBottom: 14 }}>
      {!empty && all.gt(0) && weights.every(value => value !== null) && weights.map((value, i) => <View key={i} style={{ flex: value!.div(all).toNumber(), backgroundColor: [colors.ocean, colors.tangerine, colors.toffee][i] }} />)}
    </View>
    <View style={{ flexDirection: 'row' }}>
      {(['protein', 'carbohydrate', 'fat', 'fiber'] as const).map((key, index) => <View key={key} style={{ flex: 1, gap: 3, paddingLeft: index ? 8 : 0, borderLeftWidth: index ? 1 : 0, borderColor: colors.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 6, height: 6, borderRadius: 2, backgroundColor: [colors.ocean, colors.tangerine, colors.toffee, colors.lavender][index] }} /><Text style={{ color: colors.secondary, fontSize: 12 }}>{['Protein', 'Carbs', 'Fat', 'Fiber'][index]}</Text></View>
        <Text style={{ color: colors.ink, fontSize: large ? 23 : 19, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{empty ? '–' : display(value[key])}<Text style={{ fontSize: 13 }}> g</Text></Text>
      </View>)}
    </View>
    {!empty && nutrients.some(key => value[key] == null) && <Text style={[styles.subtitle, { marginTop: 10, fontSize: 12 }]}>– means a nutrient value is unknown.</Text>}
  </View>;
}
export const FoodRow = React.memo(function FoodRow({ food, onSelect, onSave, saved = false }: { food: Food; onSelect: () => void; onSave?: () => void; saved?: boolean }) {
  return <View style={styles.row}>
    <Pressable onPress={onSelect} accessibilityRole="button" accessibilityLabel={`Select ${food.name}`} testID={`food-${food.id}`} style={({ pressed }) => ({ flex: 1, minHeight: 44, justifyContent: 'center', gap: 4, opacity: pressed ? 0.6 : 1 })}>
      <Text style={styles.foodName}>{foodLabel(food)}</Text>
      <Text style={{ color: colors.secondary, fontSize: 12 }}>{saved ? 'Your library' : food.provenance.source === 'matvaretabellen' ? 'Matvaretabellen' : 'Personal food'} · {display(food.nutrition.kcal, 0)} kcal / 100 {food.referenceUnit}</Text>
    </Pressable>
    {onSave ? <IconButton name={saved ? 'check' : 'bookmark'} label={`Save ${food.name}`} onPress={onSave} /> : <IconButton name="plus" label={`Add ${food.name}`} onPress={onSelect} />}
  </View>;
});

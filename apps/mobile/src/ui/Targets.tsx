import { useState } from 'react';
import { View } from 'react-native';
import { D, dayKey, display, nutrients, parseAmount } from '../domain/model';
import { hasTargets, macroTargetEnergy, TargetChange, targetOn, TargetValues, targetValuesSchema } from '../domain/targets';
import { useApp } from '../state/AppContext';
import { Button, Field, TextButton } from './components';
import { Text } from './Text';
import { colors } from './theme';

const labels = { kcal: 'Energy', protein: 'Protein', carbohydrate: 'Carbs', fat: 'Fat', fiber: 'Fiber' };
export function TargetEditor({ onClose }: { onClose: () => void }) {
  const app = useApp(), current = targetOn(app.repo.targets, dayKey(new Date()));
  const [fields, setFields] = useState(() => Object.fromEntries(nutrients.map(key => [key, current?.values[key] ?? ''])) as Record<typeof nutrients[number], string>);
  const values = Object.fromEntries(nutrients.map(key => [key, fields[key].trim() ? parseAmount(fields[key]) : null])) as TargetValues;
  const invalid = nutrients.some(key => fields[key].trim() && (values[key] === null || new D(values[key]!).lte(0))) || !targetValuesSchema.safeParse(values).success;
  const macroEnergy = invalid ? null : macroTargetEnergy(values);
  const mismatch = macroEnergy !== null && values.kcal !== null && !new D(macroEnergy).eq(values.kcal);
  return <View testID="target-editor" style={{ paddingVertical: 14, gap: 8, borderBottomWidth: 1, borderColor: colors.line }}>
    <Text style={{ fontSize: 19, fontWeight: '600' }}>Daily targets</Text>
    <Text style={{ fontSize: 13, color: colors.secondary, lineHeight: 19 }}>Choose your own amounts. Blank fields have no target. Changes apply from today; earlier dates keep their targets.</Text>
    <Field label="Target energy · kcal" testID="target-input-kcal" value={fields.kcal} keyboardType="decimal-pad" selectTextOnFocus maxLength={12} onChangeText={value => setFields({ ...fields, kcal: value })} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{(['protein', 'carbohydrate', 'fat', 'fiber'] as const).map(key => <View key={key} style={{ width: '47%' }}><Field label={`Target ${labels[key].toLowerCase()} · g`} testID={`target-input-${key}`} value={fields[key]} keyboardType="decimal-pad" selectTextOnFocus maxLength={12} onChangeText={value => setFields({ ...fields, [key]: value })} /></View>)}</View>
    {invalid && <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 13 }}>Use positive numbers up to 100,000, or leave a field blank.</Text>}
    {mismatch && <Text testID="target-energy-note" style={{ color: colors.secondary, fontSize: 12, lineHeight: 18 }}>Your protein, carbs and fat targets add up to {display(macroEnergy, 0)} kcal using 4/4/9. Your energy target is {display(values.kcal, 0)} kcal. Both will be kept as entered.</Text>}
    <Button label={hasTargets(values) ? 'Save targets' : 'Save without targets'} primary disabled={invalid || app.busy} onPress={() => { app.clearNotice(); void app.run(() => app.repo.saveTargets(values)).then(ok => { if (ok) onClose(); }); }} />
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><TextButton label="Clear fields" disabled={app.busy} onPress={() => setFields(Object.fromEntries(nutrients.map(key => [key, ''])) as typeof fields)} /><TextButton label="Cancel targets" disabled={app.busy} onPress={onClose} /></View>
  </View>;
}
export function TargetSummary({ change }: { change?: TargetChange }) {
  if (!change) return null;
  return <View testID="target-summary" style={{ marginVertical: 8, gap: 5 }}>
    <Text style={{ fontSize: 12, color: colors.secondary }}>Daily targets · from {change.effectiveOn}</Text>
    <Text style={{ fontSize: 13, lineHeight: 20 }}>{hasTargets(change.values) ? nutrients.filter(key => change.values[key] !== null).map(key => `${labels[key]} ${display(change.values[key])}${key === 'kcal' ? ' kcal' : ' g'}`).join(' · ') : 'Targets off'}</Text>
  </View>;
}
export function TargetSettings() {
  const app = useApp(), [editing, setEditing] = useState(false), [history, setHistory] = useState(false);
  const current = targetOn(app.repo.targets, dayKey(new Date()));
  return <View>
    {editing ? <TargetEditor onClose={() => setEditing(false)} /> : <><TargetSummary change={current} /><Button label={hasTargets(current?.values) ? 'Edit daily targets' : 'Set daily targets'} onPress={() => setEditing(true)} /></>}
    {!!app.repo.targets.length && <TextButton label={history ? 'Hide target history' : 'View target history'} onPress={() => setHistory(!history)} />}
    {history && [...app.repo.targets].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).map(change => <TargetSummary key={change.id} change={change} />)}
  </View>;
}

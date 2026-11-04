import { Text } from '../src/ui/Text';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { foodNutrition, nutrients, parseAmount } from '../src/domain/model';
import { useApp } from '../src/state/AppContext';
import { Button, Field, Screen, styles, TextButton } from '../src/ui/components';
import { applyLabelColumn, LabelCandidate, LabelForm, reviewedLabelFood, upgradeLabelForm } from '../src/domain/nutritionLabel';
import { LabelPhotoInput } from '../src/ui/LabelPhotoInput';
import { colors } from '../src/ui/theme';
export default function Manual() {
  const app = useApp(); const params = useLocalSearchParams<{ barcode?: string; edit?: string; line?: string; capture?: string }>();
  const existing = params.edit ? app.repo.foods.find(food => food.id === params.edit && food.provenance.source !== 'matvaretabellen') : undefined;
  const key = existing ? `edit:${existing.id}:${params.line ?? ''}` : `new:${params.barcode ?? ''}`;
  const [form, setForm] = useState<LabelForm>(() => app.repo.quickEntry.labelDrafts?.[key] ?? { id: existing?.id ?? app.repo.id(), name: existing?.name ?? '', barcode: existing?.barcode ?? params.barcode ?? '', basis: existing?.referenceUnit ?? 'g', amount: '100', values: Object.fromEntries(nutrients.map(key => [key, existing?.nutrition[key] ?? ''])) as LabelForm['values'] });
  const [scanning, setScanning] = useState(false), [expanded, setExpanded] = useState(false), [draftError, setDraftError] = useState('');
  const saving = useRef(false), lastSaved = useRef(JSON.stringify(form));
  useEffect(() => { const upgraded = upgradeLabelForm(form); if (upgraded !== form) setForm(upgraded); }, [form]);
  useEffect(() => {
    const serialized = JSON.stringify(form); if (saving.current || serialized === lastSaved.current) return;
    lastSaved.current = serialized;
    void app.saveLabelDraft(key, form).then(() => setDraftError('')).catch(() => setDraftError('This label draft could not be saved. Keep it open and retry.'));
  }, [form, key, app]);
  function read(candidate: LabelCandidate) {
    setForm(current => {
      const next = { ...current, scan: candidate, column: undefined, values: { kcal: '', protein: '', carbohydrate: '', fat: '', fiber: '' } };
      return candidate.columns.length === 1 && !candidate.columns[0].prepared ? applyLabelColumn(next, candidate, 0) : next;
    });
  }
  const selected = form.scan && form.column !== undefined ? form.scan.columns[form.column] : undefined;
  let canSave = false, validation = '';
  if (form.name.trim() && (!form.scan || selected)) {
    try { const food = reviewedLabelFood(form, existing); if (!existing) { const amount = parseAmount(form.amount); if (!amount) throw new Error('Enter the amount to add.'); foodNutrition(food, amount, form.basis); } canSave = true; }
    catch (reason) { validation = reason instanceof Error ? reason.message : 'Check the label values.'; }
  }
  async function save() {
    saving.current = true;
    const ok = await app.run(async () => {
      const food = reviewedLabelFood(form, existing);
      const amount = existing ? null : parseAmount(form.amount); if (!existing) { if (!amount) throw new Error('Check the amount to add.'); foodNutrition(food, amount, form.basis); }
      const draft = existing ? params.line ? { ...app.draft, lines: app.draft.lines.map(line => line.id === params.line ? { ...line, food } : line) } : undefined : { ...app.draft, lines: [...app.draft.lines, { id: app.repo.id(), query: food.name, food, quantityText: amount!, unit: form.basis, entrySource: 'product' as const }] };
      await app.repo.saveFood(food, draft, key);
    }, existing ? 'Label updated' : 'Food saved · nothing logged', true);
    saving.current = false;
    if (ok) router.dismissTo(existing && !params.line ? '/recipes' : '/entry');
  }
  return <Screen title={existing ? 'Edit label' : 'Add a food'} eyebrow="Label values" back>
    <LabelPhotoInput onRead={read} onBusy={setScanning} disabled={app.busy} hasReview={!!form.scan} captureIntent={params.capture} onCaptureConsumed={() => router.setParams({ capture: undefined })} />
    {form.scan && <View testID="label-scan-review" style={{ gap: 5, marginBottom: 10 }}>
      <Text style={{ fontSize: 14, fontWeight: '600' }}>Check the package</Text>
      {!form.scan.columns.length && <Text style={{ fontSize: 13, color: colors.secondary }}>{form.scan.notice ?? 'Reference amount not read. Enter the label values manually or try a closer photo.'}</Text>}
      {form.scan.columns.length > 1 && <Text style={{ fontSize: 13, color: colors.secondary }}>Choose one column from the label.</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{form.scan.columns.map((column, index) => <Button key={index} compact label={column.title} accessibilityLabel={`Use label column ${index + 1}: ${column.title}`} selected={form.column === index} disabled={app.busy || scanning} onPress={() => setForm(applyLabelColumn(form, form.scan!, index))} />)}</View>
      {selected && selected.amount !== '100' && <Text style={{ fontSize: 12, color: colors.secondary }}>Normalized from {selected.amount} {selected.unit} to 100 {selected.unit}. Check the measured serving amount.</Text>}
      {selected?.evidence.kcal && /kj/i.test(selected.evidence.kcal) && !/kcal/i.test(selected.evidence.kcal) && <Text style={{ fontSize: 12, color: colors.secondary }}>Energy converted from kJ using 4.184 kJ per kcal.</Text>}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><TextButton label={expanded ? 'Hide recognized text' : 'Recognized text'} onPress={() => setExpanded(!expanded)} /><TextButton label="Enter manually" onPress={() => setForm({ ...form, scan: undefined, column: undefined })} /></View>
      {expanded && <Text testID="label-recognized-text" selectable style={{ fontSize: 12, color: colors.secondary }}>{form.scan.text}</Text>}
    </View>}
    <Field compact label="Food name" value={form.name} onChangeText={name => setForm({ ...form, name })} placeholder="Name on the package" maxLength={300} />
    <Field compact label="Barcode (optional)" value={form.barcode} onChangeText={barcode => setForm({ ...form, barcode })} keyboardType="number-pad" maxLength={30} editable={existing?.provenance.source !== 'openFoodFacts'} />
    <View style={{ flexDirection: 'row', gap: 8, marginVertical: 8 }}><Button compact label="Per 100 g" selected={form.basis === 'g'} disabled={!!form.scan} onPress={() => setForm({ ...form, basis: 'g', amount: form.basis === 'g' ? form.amount : '' })} /><Button compact label="Per 100 ml" selected={form.basis === 'ml'} disabled={!!form.scan} onPress={() => setForm({ ...form, basis: 'ml', amount: form.basis === 'ml' ? form.amount : '' })} /></View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>{nutrients.map((key, index) => <View key={key} style={{ width: '48%' }}><Field compact label={['Energy · kcal', 'Protein · g', 'Carbs · g', 'Fat · g', 'Fiber · g'][index]} value={form.values[key]} onChangeText={value => setForm({ ...form, values: { ...form.values, [key]: value } })} keyboardType="decimal-pad" selectTextOnFocus maxLength={100} placeholder="Unknown" />{selected?.issues[key] && !form.values[key] && <Text style={{ fontSize: 11, color: colors.error, marginBottom: 4 }}>{selected.issues[key]}</Text>}{selected?.suggestions?.[key] && !form.values[key] && <TextButton label={`Use ${selected.evidence[key]?.match(/(\d+(?:[.,]\d+)?)\s*$/)?.[1] ?? selected.suggestions[key]} g`} accessibilityLabel={`Confirm label ${key} in grams`} onPress={() => setForm({ ...form, values: { ...form.values, [key]: selected.suggestions![key] } })} />}</View>)}{!existing && <View style={{ width: '48%' }}><Field compact label={`Amount to add · ${form.basis}`} value={form.amount} onChangeText={amount => setForm({ ...form, amount })} keyboardType="decimal-pad" selectTextOnFocus maxLength={100} /></View>}</View>
    <Text style={[styles.subtitle, { marginBottom: 10, fontSize: 12 }]}>Review every value against the label. Blank means unknown; 0 means the label states zero.</Text>
    {!!validation && <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 12, marginBottom: 6 }}>{validation}</Text>}
    {!!draftError && <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 12 }}>{draftError}</Text>}
    {existing && <Text style={[styles.subtitle, { marginBottom: 10, fontSize: 12 }]}>Updates future additions{params.line ? ' and this ingredient' : ''}. Previously logged food keeps its saved values.</Text>}
    <Button label={existing ? 'Save label' : 'Confirm and add'} primary onPress={() => void save()} disabled={app.busy || scanning || !canSave} />
    <TextButton label="Discard label draft" disabled={app.busy || scanning} onPress={() => { saving.current = true; void app.run(() => app.repo.saveLabelDraft(key, null), 'Label draft discarded').then(ok => { if (ok) router.dismissTo(existing && !params.line ? '/recipes' : '/entry'); else saving.current = false; }); }} />
  </Screen>;
}

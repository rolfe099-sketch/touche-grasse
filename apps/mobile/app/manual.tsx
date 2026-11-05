import { Text } from '../src/ui/Text';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { foodNutrition, nutrients, parseAmount } from '../src/domain/model';
import { useApp } from '../src/state/AppContext';
import { Button, Field, Screen, styles, TextButton } from '../src/ui/components';
import { applyLabelColumn, canMergeLabelColumn, mergeLabelColumn, receiveLabelScan, LabelCandidate, LabelForm, reviewedLabelFood, upgradeLabelForm } from '../src/domain/nutritionLabel';
import { LabelPhotoInput } from '../src/ui/LabelPhotoInput';
import { LabelNutritionReview } from '../src/ui/LabelNutritionReview';
import { colors } from '../src/ui/theme';
export default function Manual() {
  const app = useApp(); const params = useLocalSearchParams<{ barcode?: string; edit?: string; line?: string; capture?: string }>();
  const existing = params.edit ? app.repo.foods.find(food => food.id === params.edit && food.provenance.source !== 'matvaretabellen') : undefined;
  const key = existing ? `edit:${existing.id}:${params.line ?? ''}` : `new:${params.barcode ?? ''}`;
  const [form, setForm] = useState<LabelForm>(() => app.repo.quickEntry.labelDrafts?.[key] ?? { id: existing?.id ?? app.repo.id(), name: existing?.name ?? '', barcode: existing?.barcode ?? params.barcode ?? '', basis: existing?.referenceUnit ?? 'g', amount: '100', values: Object.fromEntries(nutrients.map(key => [key, existing?.nutrition[key] ?? ''])) as LabelForm['values'] });
  const [scanning, setScanning] = useState(false), [expanded, setExpanded] = useState(false), [draftError, setDraftError] = useState('');
  const saving = useRef(false), lastSaved = useRef(JSON.stringify(form)), requested = useRef(JSON.stringify(form));
  const [retry, setRetry] = useState(0);
  const [reviewPhoto, setReviewPhoto] = useState<{ uri: string; scannedAt: string }>();
  useEffect(() => { const upgraded = upgradeLabelForm(form); if (upgraded !== form) setForm(upgraded); }, [form]);
  useEffect(() => {
    const serialized = JSON.stringify(form); if (saving.current || serialized === lastSaved.current || serialized === requested.current) return;
    requested.current = serialized;
    void app.saveLabelDraft(key, form).then(() => { lastSaved.current = serialized; if (requested.current === serialized) setDraftError(''); }).catch(() => { if (requested.current === serialized) setDraftError('This label draft could not be saved. Keep it open and retry.'); });
  }, [form, key, app, retry]);
  function read(candidate: LabelCandidate, photo?: string) {
    setForm(current => receiveLabelScan(current, candidate));
    setReviewPhoto(photo ? { uri: photo, scannedAt: candidate.scannedAt } : undefined);
  }
  function editValue(key: typeof nutrients[number], value: string) { setForm(current => ({ ...current, values: { ...current.values, [key]: value }, edited: [...new Set([...(current.edited ?? []), key])] })); }
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
    <LabelPhotoInput onRead={read} onPhoto={() => setReviewPhoto(undefined)} onBusy={setScanning} disabled={app.busy} hasReview={!!form.scan || !!form.rescan} captureIntent={params.capture} onCaptureConsumed={() => router.setParams({ capture: undefined })} />
    {form.rescan && <View testID="label-rescan-review" style={{ gap: 5, marginBottom: 12 }}>
      <Text style={{ fontSize: 14, fontWeight: '600' }}>New photo · your values are kept</Text>
      {!form.rescan.columns.length && <Text style={{ color: colors.secondary, fontSize: 12 }}>No reference column read. Try a closer photo or keep your current values.</Text>}
      {form.rescan.columns.map((column, index) => {
        const merge = canMergeLabelColumn(form, form.rescan!, index);
        return <View key={index} style={{ gap: 3 }}><Text style={{ color: colors.secondary, fontSize: 12 }}>{column.title}{merge ? ' · fills blanks; keeps corrections' : ' · different units or preparation; replaces all values'}</Text><Button compact label={merge ? 'Use photo · keep corrections' : `Replace values: ${column.title}`} accessibilityLabel={`${merge ? 'Merge' : 'Replace with'} new label column ${index + 1}`} disabled={app.busy || scanning} onPress={() => setForm(merge ? mergeLabelColumn(form, form.rescan!, index) : applyLabelColumn(form, form.rescan!, index))} /></View>;
      })}
      <TextButton label="Keep current values" disabled={app.busy || scanning} onPress={() => setForm({ ...form, rescan: undefined })} />
    </View>}
    {form.scan && <View testID="label-scan-review" style={{ gap: 5, marginBottom: 10 }}>
      <Text style={{ fontSize: 14, fontWeight: '600' }}>Check the package</Text>
      {!form.scan.columns.length && <Text style={{ fontSize: 13, color: colors.secondary }}>{form.scan.notice ?? 'Reference amount not read. Enter the label values manually or try a closer photo.'}</Text>}
      {form.scan.columns.length > 1 && <Text style={{ fontSize: 13, color: colors.secondary }}>Choose one column from the label.</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{form.scan.columns.map((column, index) => <Button key={index} compact label={column.title} accessibilityLabel={`Use label column ${index + 1}: ${column.title}`} selected={form.column === index} disabled={app.busy || scanning} onPress={() => { if (form.column === index) return; setForm(form.column !== undefined || nutrients.some(key => form.values[key] !== '') ? { ...form, rescan: { ...form.scan!, columns: [column] } } : applyLabelColumn(form, form.scan!, index)); }} />)}</View>
      {selected && selected.amount !== '100' && <Text style={{ fontSize: 12, color: colors.secondary }}>Normalized from {selected.amount} {selected.unit} to 100 {selected.unit}. Check the measured serving amount.</Text>}
      {selected?.evidence.kcal && /kj/i.test(selected.evidence.kcal) && !/kcal/i.test(selected.evidence.kcal) && <Text style={{ fontSize: 12, color: colors.secondary }}>Energy converted from kJ using 4.184 kJ per kcal.</Text>}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><TextButton label={expanded ? 'Hide recognized text' : 'Recognized text'} onPress={() => setExpanded(!expanded)} /><TextButton label="Enter manually" onPress={() => setForm({ ...form, scan: undefined, column: undefined, rescan: undefined })} /></View>
      {expanded && <Text testID="label-recognized-text" selectable style={{ fontSize: 12, color: colors.secondary }}>{form.scan.text}</Text>}
    </View>}
    <Field compact label="Food name" value={form.name} onChangeText={name => setForm({ ...form, name })} placeholder="Name on the package" maxLength={300} />
    <Field compact label="Barcode (optional)" value={form.barcode} onChangeText={barcode => setForm({ ...form, barcode })} keyboardType="number-pad" maxLength={30} editable={existing?.provenance.source !== 'openFoodFacts'} />
    <View style={{ flexDirection: 'row', gap: 8, marginVertical: 8 }}><Button compact label="Per 100 g" selected={form.basis === 'g'} disabled={!!form.scan} onPress={() => setForm({ ...form, basis: 'g', amount: form.basis === 'g' ? form.amount : '' })} /><Button compact label="Per 100 ml" selected={form.basis === 'ml'} disabled={!!form.scan} onPress={() => setForm({ ...form, basis: 'ml', amount: form.basis === 'ml' ? form.amount : '' })} /></View>
    <LabelNutritionReview values={form.values} selected={selected} photo={!form.rescan && form.scan?.scannedAt === reviewPhoto?.scannedAt ? reviewPhoto?.uri : undefined} disabled={app.busy} onChange={editValue}>
    {!existing && <Field compact label={`Amount to add · ${form.basis}`} value={form.amount} onChangeText={amount => setForm({ ...form, amount })} keyboardType="decimal-pad" selectTextOnFocus maxLength={100} editable={!app.busy} />}
    </LabelNutritionReview>

    <Text style={[styles.subtitle, { marginBottom: 10, fontSize: 12 }]}>Review every value against the label. Blank means unknown; 0 means the label states zero.</Text>
    {!!validation && <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 12, marginBottom: 6 }}>{validation}</Text>}
    {!!draftError && <View><Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 12 }}>{draftError}</Text><TextButton label="Retry saving label draft" onPress={() => { requested.current = lastSaved.current; setRetry(value => value + 1); }} /></View>}
    {existing && <Text style={[styles.subtitle, { marginBottom: 10, fontSize: 12 }]}>Updates future additions{params.line ? ' and this ingredient' : ''}. Previously logged food keeps its saved values.</Text>}
    <Button label={existing ? 'Save label' : 'Confirm and add'} primary onPress={() => void save()} disabled={app.busy || scanning || !!form.rescan || !canSave} />
    <TextButton label="Discard label draft" disabled={app.busy || scanning} onPress={() => { saving.current = true; void app.run(() => app.repo.saveLabelDraft(key, null), 'Label draft discarded').then(ok => { if (ok) router.dismissTo(existing && !params.line ? '/recipes' : '/entry'); else saving.current = false; }); }} />
  </Screen>;
}

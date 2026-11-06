import { useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { BarcodeCandidate, BarcodeReviewValues, confirmBarcodeProduct } from '../domain/barcode';
import { nutrients } from '../domain/model';
import { useApp } from '../state/AppContext';
import { Button, Field, SegmentButton, TextButton } from './components';
import { Text } from './Text';
import { colors } from './theme';

export function BarcodeReview({ candidate, onAdded, onCancel }: { candidate: BarcodeCandidate; onAdded: () => void; onCancel: () => void }) {
  const app = useApp();
  const [values, setValues] = useState<BarcodeReviewValues>(() => ({ name: candidate.name, referenceUnit: candidate.referenceUnit, amount: '100', nutrition: Object.fromEntries(nutrients.map(key => [key, candidate.nutrition[key] ?? ''])) as BarcodeReviewValues['nutrition'] }));
  const edited = useRef(new Map<'g' | 'ml', BarcodeReviewValues>());
  function changeBasis(unit: 'g' | 'ml') {
    if (unit === values.referenceUnit) return;
    if (values.referenceUnit) edited.current.set(values.referenceUnit, values);
    const previous = edited.current.get(unit), profile = candidate.profiles?.find(item => item.referenceUnit === unit);
    setValues(previous ? { ...previous, name: values.name } : { ...values, referenceUnit: unit, amount: values.referenceUnit ? '' : values.amount,
      nutrition: Object.fromEntries(nutrients.map(key => [key, profile?.nutrition[key] ?? (unit === candidate.referenceUnit ? candidate.nutrition[key] : null) ?? ''])) as BarcodeReviewValues['nutrition'] });
  }
  const notes = candidate.profiles?.find(item => item.referenceUnit === values.referenceUnit)?.notes ?? candidate.notes;
  let reviewed: ReturnType<typeof confirmBarcodeProduct> | undefined, error = '';
  try { reviewed = confirmBarcodeProduct(candidate, values); } catch (reason) { error = reason instanceof Error ? reason.message : 'Check the label values.'; }
  return <View testID="barcode-review" style={{ gap: 6, borderTopWidth: 1, borderColor: colors.line, paddingTop: 10 }}>
    <Text style={{ fontSize: 18, fontWeight: '600' }}>Check the package</Text>
    {!!candidate.brand && <Text style={{ color: colors.secondary, fontSize: 13 }}>{candidate.brand}{candidate.quantity ? ` · ${candidate.quantity}` : ''}</Text>}
    <Text style={{ color: colors.secondary, fontSize: 12 }}>As sold · community data. Check your label.</Text>
    <Field compact label="Product name" value={values.name} onChangeText={name => setValues({ ...values, name })} maxLength={300} />
    <View style={{ flexDirection: 'row', gap: 6 }}><SegmentButton label="Per 100 g" selected={values.referenceUnit === 'g'} onPress={() => changeBasis('g')} /><SegmentButton label="Per 100 ml" selected={values.referenceUnit === 'ml'} onPress={() => changeBasis('ml')} /></View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 }}>{nutrients.map((key, i) => <View key={key} style={{ width: '47%' }}><Field compact label={['Label energy · kcal', 'Label protein · g', 'Label carbs · g', 'Label fat · g', 'Label fiber · g'][i]} value={values.nutrition[key]} onChangeText={value => setValues({ ...values, nutrition: { ...values.nutrition, [key]: value } })} keyboardType="decimal-pad" selectTextOnFocus maxLength={100} placeholder="Unknown" /></View>)}<View style={{ width: '47%' }}><Field compact label={`Amount to add${values.referenceUnit ? ` · ${values.referenceUnit}` : ''}`} value={values.amount} onChangeText={amount => setValues({ ...values, amount })} keyboardType="decimal-pad" selectTextOnFocus maxLength={20} /></View></View>
    {notes.map(note => <Text key={note} style={{ fontSize: 12, color: colors.secondary }}>{note}</Text>)}
    {!!error && !!values.referenceUnit && <Text accessibilityRole="alert" style={{ fontSize: 12, color: colors.secondary }}>{error}</Text>}
    <Button label="Confirm and add" primary disabled={!reviewed || app.busy} onPress={() => { if (!reviewed) return; const { food, amount } = confirmBarcodeProduct(candidate, values); void app.run(() => app.repo.addBarcodeFood(food, app.draft, amount), 'Product saved · nothing logged', true).then(ok => { if (ok) onAdded(); }); }} />
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><TextButton label="Open Food Facts ↗" onPress={() => void Linking.openURL(candidate.sourceURL)} /><TextButton label="ODbL ↗" onPress={() => void Linking.openURL('https://opendatacommons.org/licenses/odbl/1-0/')} /><TextButton label="Cancel" accessibilityLabel="Cancel product review" disabled={app.busy} onPress={onCancel} /></View>
    <Text style={{ fontSize: 11, color: colors.secondary }}>Reviewed products stay available offline.</Text>
  </View>;
}

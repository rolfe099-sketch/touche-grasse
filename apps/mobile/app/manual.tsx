import { Text } from '../src/ui/Text';
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Food, Nutrition, nutrients, parseAmount, validateFood } from '../src/domain/model';
import { useApp } from '../src/state/AppContext';
import { Button, Field, Screen, styles } from '../src/ui/components';
import { confirmBarcodeProduct } from '../src/domain/barcode';
export default function Manual() {
  const app = useApp(); const params = useLocalSearchParams<{ barcode?: string; edit?: string; line?: string }>();
  const existing = params.edit ? app.repo.foods.find(food => food.id === params.edit && food.provenance.source !== 'matvaretabellen') : undefined;
  const [id] = useState(() => existing?.id ?? app.repo.id()); const [name, setName] = useState(existing?.name ?? ''); const [barcode, setBarcode] = useState(existing?.barcode ?? params.barcode ?? '');
  const [basis, setBasis] = useState<'g' | 'ml'>(existing?.referenceUnit ?? 'g'); const [values, setValues] = useState(() => Object.fromEntries(nutrients.map(key => [key, existing?.nutrition[key] ?? ''])) as Record<typeof nutrients[number], string>);
  async function save() {
    const ok = await app.run(async () => {
      const nutrition = Object.fromEntries(nutrients.map(key => {
        if (!values[key].trim()) return [key, null];
        const value = values[key] === existing?.nutrition[key] ? values[key] : parseAmount(values[key]); if (value === null) throw new Error('Check the nutrition values. Use numbers, or leave unknown values blank.');
        return [key, value];
      })) as Nutrition;
      let food: Food = validateFood({ ...(existing ?? {}), id, name, aliases: existing?.aliases ?? [], barcode: barcode.trim() || null, referenceUnit: basis, nutrition, gramsPerMeasure: existing?.gramsPerMeasure ?? {},
        provenance: { source: 'manual', sourceID: id, retrievedAt: new Date().toISOString(), nutrientSources: {} } });
      if (existing?.provenance.source === 'openFoodFacts' && existing.barcode) {
        const original = existing.provenance.labelReview;
        food = { ...confirmBarcodeProduct({ barcode: existing.barcode, name: original?.originalName ?? existing.name, aliases: existing.aliases, brand: '', quantity: '', nutrition: original?.originalNutrition ?? existing.nutrition,
          referenceUnit: original ? original.originalReferenceUnit : existing.referenceUnit, nutritionSource: original?.nutritionSource ?? 'Saved product record', retrievedAt: existing.provenance.retrievedAt,
          sourceURL: `https://world.openfoodfacts.org/product/${existing.barcode}`, notes: [], profiles: [] }, { name, referenceUnit: basis, nutrition: values, amount: '100' }).food,
          id: existing.id, gramsPerMeasure: existing.gramsPerMeasure, gramsPerMilliliter: existing.gramsPerMilliliter };
      }
      const draft = existing ? params.line ? { ...app.draft, lines: app.draft.lines.map(line => line.id === params.line ? { ...line, food } : line) } : undefined : { ...app.draft, lines: [...app.draft.lines, { id: app.repo.id(), query: food.name, food, quantityText: '100', unit: basis }] };
      await app.repo.saveFood(food, draft);
    }, existing ? 'Label updated' : 'Food saved', true);
    if (ok) router.dismissTo(existing && !params.line ? '/recipes' : '/entry');
  }
  return <Screen title={existing ? 'Edit label' : 'Add a food'} eyebrow="Label values" back>
    <Field label="Food name" value={name} onChangeText={setName} placeholder="Name on the package" />
    <Field label="Barcode (optional)" value={barcode} onChangeText={setBarcode} keyboardType="number-pad" editable={existing?.provenance.source !== 'openFoodFacts'} />
    <Text style={[styles.subtitle, { marginBottom: 12 }]}>Copy the label values for:</Text>
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}><Button label="Per 100 g" selected={basis === 'g'} onPress={() => setBasis('g')} /><Button label="Per 100 ml" selected={basis === 'ml'} onPress={() => setBasis('ml')} /></View>
    {nutrients.map((key, index) => <Field key={key} label={['Energy · kcal', 'Protein · g', 'Carbs · g', 'Fat · g', 'Fiber · g'][index]} value={values[key]} onChangeText={value => setValues({ ...values, [key]: value })} keyboardType="decimal-pad" placeholder="Unknown" />)}
    <Text style={[styles.subtitle, { marginBottom: 22 }]}>Leave unknown values blank. Enter 0 only when the label states zero. Review the values before saving.</Text>
    {existing && <Text style={[styles.subtitle, { marginBottom: 14 }]}>Updates future additions{params.line ? ' and this ingredient' : ''}. Previously logged food keeps its saved values.</Text>}
    <Button label={existing ? 'Save label' : 'Confirm and add'} primary onPress={() => void save()} disabled={app.busy || !name.trim()} />
  </Screen>;
}

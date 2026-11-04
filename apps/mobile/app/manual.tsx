import { Text } from '../src/ui/Text';
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Food, Nutrition, nutrients, parseAmount, validateFood } from '../src/domain/model';
import { useApp } from '../src/state/AppContext';
import { Button, Field, Screen, styles } from '../src/ui/components';
export default function Manual() {
  const app = useApp(); const params = useLocalSearchParams<{ barcode?: string }>();
  const [id] = useState(app.repo.id); const [name, setName] = useState(''); const [barcode, setBarcode] = useState(params.barcode ?? '');
  const [basis, setBasis] = useState<'g' | 'ml'>('g'); const [values, setValues] = useState({ kcal: '', protein: '', carbohydrate: '', fat: '', fiber: '' });
  async function save() {
    const ok = await app.run(async () => {
      const nutrition = Object.fromEntries(nutrients.map(key => {
        if (!values[key].trim()) return [key, null];
        const value = parseAmount(values[key]); if (value === null) throw new Error('Check the nutrition values. Use numbers, or leave unknown values blank.');
        return [key, value];
      })) as Nutrition;
      const food: Food = validateFood({ id, name, aliases: [], barcode: barcode.trim() || null, referenceUnit: basis, nutrition, gramsPerMeasure: {},
        provenance: { source: 'manual', sourceID: id, retrievedAt: new Date().toISOString(), nutrientSources: {} } });
      await app.repo.saveFood(food);
      app.setDraft({ ...app.draft, lines: [...app.draft.lines, { id: app.repo.id(), query: food.name, food, quantityText: '100', unit: basis }] });
    }, 'Food saved');
    if (ok) router.dismissTo('/entry');
  }
  return <Screen title="Add a food" eyebrow="Label values" back>
    <Field label="Food name" value={name} onChangeText={setName} placeholder="Name on the package" />
    <Field label="Barcode (optional)" value={barcode} onChangeText={setBarcode} keyboardType="number-pad" />
    <Text style={[styles.subtitle, { marginBottom: 12 }]}>Copy the label values for:</Text>
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}><Button label="Per 100 g" selected={basis === 'g'} onPress={() => setBasis('g')} /><Button label="Per 100 ml" selected={basis === 'ml'} onPress={() => setBasis('ml')} /></View>
    {nutrients.map((key, index) => <Field key={key} label={['Energy · kcal', 'Protein · g', 'Carbs · g', 'Fat · g', 'Fiber · g'][index]} value={values[key]} onChangeText={value => setValues({ ...values, [key]: value })} keyboardType="decimal-pad" placeholder="Unknown" />)}
    <Text style={[styles.subtitle, { marginBottom: 22 }]}>Leave unknown values blank. Enter 0 only when the label states zero. Review the values before saving.</Text>
    <Button label="Confirm and add" primary onPress={() => void save()} disabled={app.busy || !name.trim()} />
  </Screen>;
}

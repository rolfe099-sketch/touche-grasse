import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { D, display, Food, foodNutrition, Nutrition, parseAmount, recipePortion } from '../domain/model';
import { foodLabel } from '../domain/foodLanguage';
import { RecipeIdea, recipeSources, recipeStorageNote } from '../domain/recipeIdeas';
import { Button, Field, IconButton, NutritionView, styles, TextButton } from './components';
import { Icon } from './Icon';
import { Reveal } from './Motion';
import { Text } from './Text';
import { colors } from './theme';

export function DiscoverFood({ food, expanded, onExpand, onAdd, onSave, saved, disabled }: { food: Food; expanded: boolean; onExpand: () => void; onAdd: (quantity: string) => void; onSave: () => void; saved: boolean; disabled: boolean }) {
  const [amount, setAmount] = useState('100');
  const quantity = parseAmount(amount);
  let nutrition: Nutrition | undefined; try { if (quantity) nutrition = foodNutrition(food, quantity, food.referenceUnit); } catch { /* Partial amounts remain editable. */ }
  return <View style={{ borderBottomWidth: 1, borderColor: colors.line }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 11 }}>
      <Pressable testID={`food-${food.id}`} accessibilityRole="button" accessibilityLabel={`Select ${foodLabel(food)}`} disabled={disabled} onPress={() => onAdd('100')} style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 48, justifyContent: 'center', gap: 5, opacity: pressed || disabled ? .6 : 1 })}>
        <Text style={styles.foodName}>{foodLabel(food)}</Text>
        <Text style={{ fontSize: 12, color: colors.secondary }}>{display(food.nutrition.kcal, 0)} kcal · P {display(food.nutrition.protein)} g / 100 {food.referenceUnit}</Text>
      </Pressable>
      <IconButton name={expanded ? 'minus' : 'next'} selected={expanded} label={`${expanded ? 'Close' : 'Details for'} ${foodLabel(food)}`} onPress={onExpand} />
      <IconButton name={saved ? 'check' : 'bookmark'} selected={saved} label={`Save ${foodLabel(food)}`} disabled={disabled || saved} onPress={onSave} />
    </View>
    {expanded && <Reveal trigger={food.id} style={{ paddingBottom: 15, gap: 9 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ flex: 1 }}><Field compact label={`Amount · ${food.referenceUnit}`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" selectTextOnFocus /></View><Button compact label={`Add ${amount || '…'} ${food.referenceUnit}`} disabled={disabled || !nutrition} onPress={() => { if (quantity && nutrition) onAdd(quantity); }} /></View>
      {nutrition ? <NutritionView value={nutrition} /> : <Text style={{ color: colors.error, fontSize: 13 }}>Enter an amount greater than zero.</Text>}
      <Text style={{ fontSize: 12, color: colors.secondary, lineHeight: 18 }}>{food.provenance.source === 'matvaretabellen' ? 'Matvaretabellen · ' : food.provenance.source === 'openFoodFacts' ? 'Open Food Facts · label reviewed · ' : 'Your confirmed food · '}{food.name}</Text>
      <Text style={{ fontSize: 12, color: colors.secondary }}>Nutrition uses this exact record and reference unit.</Text>
      {food.provenance.sourceURL && <TextButton label="View food source" onPress={() => void Linking.openURL(food.provenance.sourceURL!).catch(() => undefined)} />}
    </Reveal>}
  </View>;
}

export function DiscoverRecipe({ idea, index, expanded, onExpand, saved, disabled, onSave, onEdit, onPrepare }: { idea: RecipeIdea; index: number; expanded: boolean; onExpand: () => void; saved: boolean; disabled: boolean; onSave: () => void; onEdit: () => void; onPrepare: () => void }) {
  const [showNotes, setShowNotes] = useState(false);
  const nutrition = recipePortion(idea.recipe);
  return <View testID={`idea-${idea.slug}`} style={{ borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 14 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Close' : 'View'} recipe ${idea.name}`} accessibilityState={{ expanded }} onPress={onExpand} style={({ pressed }) => ({ flexDirection: 'row', gap: 12, minHeight: 72, alignItems: 'center', opacity: pressed ? .6 : 1 })}>
      <View style={{ width: 27, alignSelf: 'stretch', paddingTop: 7, borderTopWidth: 2, borderColor: [colors.forrest, colors.ocean, colors.action][index % 3] }}><Text style={{ fontSize: 14, color: colors.secondary, fontVariant: ['tabular-nums'] }}>{String(index + 1).padStart(2, '0')}</Text></View>
      <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
        <Text style={{ fontSize: 21, lineHeight: 25, fontWeight: '600', letterSpacing: -.4 }}>{idea.name}</Text>
        <Text style={{ fontSize: 12, color: colors.secondary }}>{idea.minutes} min · {idea.recipe.servings} servings{saved ? ' · Saved' : ''}</Text>
        <Text style={{ fontSize: 12, color: colors.secondary }}>{display(nutrition.kcal, 0)} kcal · Fiber {display(nutrition.fiber)} g</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}><Text style={{ fontSize: 25, fontWeight: '600', color: colors.forrest, fontVariant: ['tabular-nums'] }}>{display(nutrition.protein, 0)}<Text style={{ fontSize: 12 }}> g</Text></Text><Text style={{ fontSize: 11, color: colors.secondary }}>protein</Text><Icon name={expanded ? 'minus' : 'next'} size={15} color={colors.secondary} /></View>
    </Pressable>
    {expanded && <Reveal trigger={idea.slug} style={{ paddingTop: 14, gap: 12 }}>
      <Text style={{ ...styles.body, fontSize: 14 }}>{idea.description}</Text>
      <View testID="idea-nutrition" style={{ borderTopWidth: 1, borderColor: colors.line, paddingTop: 9 }}><Text style={styles.label}>Per serving · 1/{new D(idea.recipe.servings).toFixed()} of the recipe</Text><NutritionView value={nutrition} /></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button compact label={saved ? 'Open saved copy' : 'Save recipe'} icon={saved ? 'book' : 'bookmark'} onPress={saved ? onEdit : onSave} disabled={disabled} />
        <Button compact primary label="Prepare batch" icon="bowl" onPress={onPrepare} disabled={disabled} />
      </View>
      <Text style={{ fontSize: 12, color: colors.secondary }}>Saving or preparing never logs food as eaten.</Text>
      <View style={{ paddingTop: 4 }}><Text style={{ fontSize: 16, fontWeight: '600' }}>Ingredients · whole recipe</Text><Text style={{ fontSize: 12, color: colors.secondary, marginTop: 4 }}>Use the stated raw, dry or drained weights.</Text>
        {idea.recipe.ingredients.map(i => <View key={i.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.line }}><Text style={{ flex: 1, fontSize: 14, lineHeight: 19 }}>{foodLabel(i.food)}</Text><Text style={{ fontSize: 14, fontVariant: ['tabular-nums'] }}>{display(i.quantity, 0)} {i.unit}</Text></View>)}
      </View>
      <Text style={{ fontSize: 16, fontWeight: '600', marginTop: 4 }}>Method</Text>
      {idea.recipe.steps.map((step, i) => <View key={i} style={{ flexDirection: 'row', gap: 10 }}><Text style={{ width: 20, color: colors.action, fontSize: 14 }}>{i + 1}.</Text><Text style={{ flex: 1, fontSize: 14, lineHeight: 21 }}>{step}</Text></View>)}
      <TextButton label={showNotes ? 'Hide storage & sources' : 'Storage & nutrition sources'} onPress={() => setShowNotes(!showNotes)} />
      {showNotes && <View style={{ gap: 9, borderLeftWidth: 2, borderColor: colors.line, paddingLeft: 12 }}>
        <Text style={{ fontSize: 13, lineHeight: 20, color: colors.secondary }}>{recipeStorageNote}</Text>
        <Text style={{ fontSize: 13, lineHeight: 20, color: colors.secondary }}>Original Touche Grasse recipe. Nutrition is calculated from the listed Matvaretabellen records, not a laboratory analysis of the cooked dish. Use an editable copy for different products. Add measured cooked weight to that copy for accurate gram portions.</Text>
        <TextButton label="Food storage guidance · Mattilsynet" onPress={() => void Linking.openURL(recipeSources.storage).catch(() => undefined)} />
        <TextButton label="Safe cooking temperatures" onPress={() => void Linking.openURL(recipeSources.cooking).catch(() => undefined)} />
        <TextButton label="Norwegian dietary guidance" onPress={() => void Linking.openURL(recipeSources.dietary).catch(() => undefined)} />
      </View>}
    </Reveal>}
  </View>;
}

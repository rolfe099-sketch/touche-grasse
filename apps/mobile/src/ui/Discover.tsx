import { useState } from 'react';
import { Linking, Pressable, useWindowDimensions, View } from 'react-native';
import { display, Food, foodNutrition, Nutrition, parseAmount, recipePortion } from '../domain/model';
import { foodLabel } from '../domain/foodLanguage';
import { RecipeIdea, recipeSources, recipeStorageNote } from '../domain/recipeIdeas';
import { Button, Field, IconButton, styles, TextButton } from './components';
import { DiscoverMode, DiscoverNutrition } from './DiscoverControls';
import { RecipeArtwork, recipePaper } from './RecipeArtwork';
import { Icon } from './Icon';
import { Reveal } from './Motion';
import { Text } from './Text';
import { colors, serif } from './theme';

export function DiscoverFood({ food, expanded, onExpand, onAdd, onSave, saved, disabled }: { food: Food; expanded: boolean; onExpand: () => void; onAdd: (quantity: string) => void; onSave: () => void; saved: boolean; disabled: boolean }) {
  const [amount, setAmount] = useState('100');
  const quantity = parseAmount(amount), label = foodLabel(food), [name, preparation] = label.split(' · ');
  let nutrition: Nutrition | undefined; try { if (quantity) nutrition = foodNutrition(food, quantity, food.referenceUnit); } catch { /* Keep incomplete amounts editable. */ }
  return <View style={{ borderBottomWidth: 1, borderColor: colors.line, paddingBottom: expanded ? 14 : 0 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 13 }}>
      <Pressable testID={`food-${food.id}`} accessibilityRole="button" accessibilityLabel={`Select ${label}`} accessibilityState={{ disabled }} disabled={disabled} onPress={() => onAdd('100')} style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 50, justifyContent: 'center', gap: 6, opacity: pressed || disabled ? .6 : 1 })}>
        <Text style={{ fontSize: 17, fontWeight: '500', lineHeight: 22 }}>{name}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>{preparation && <Text style={{ color: colors.citrus, fontSize: 11 }}>{preparation.toUpperCase()}</Text>}<Text style={{ fontSize: 12, color: colors.secondary }}>{display(food.nutrition.kcal, 0)} kcal · {display(food.nutrition.protein)} g protein / 100 {food.referenceUnit}</Text></View>
      </Pressable>
      <IconButton name={expanded ? 'minus' : 'next'} selected={expanded} label={`${expanded ? 'Close' : 'Details for'} ${label}`} onPress={onExpand} />
      <IconButton name={saved ? 'check' : 'bookmark'} selected={saved} label={`Save ${label}`} disabled={disabled || saved} onPress={onSave} />
    </View>
    {expanded && <Reveal trigger={food.id} style={{ gap: 12, padding: 14, backgroundColor: colors.surface, borderRadius: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ flex: 1 }}><Field compact label={`Amount · ${food.referenceUnit}`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" selectTextOnFocus /></View><Button compact primary label={`Add ${amount || '…'} ${food.referenceUnit}`} disabled={disabled || !nutrition} onPress={() => { if (quantity && nutrition) onAdd(quantity); }} /></View>
      {nutrition ? <DiscoverNutrition value={nutrition} caption={`For ${amount} ${food.referenceUnit}`} /> : <Text style={{ color: colors.error, fontSize: 13 }}>Enter an amount greater than zero.</Text>}
      <Text style={{ fontSize: 11, color: colors.secondary, lineHeight: 17 }}>{food.provenance.source === 'matvaretabellen' ? 'Matvaretabellen · ' : food.provenance.source === 'openFoodFacts' ? 'Open Food Facts · label reviewed · ' : 'Your confirmed food · '}{food.name}</Text>
      {food.provenance.sourceURL && <TextButton label="View food source" onPress={() => void Linking.openURL(food.provenance.sourceURL!).catch(() => undefined)} />}
    </Reveal>}
  </View>;
}

type RecipeProps = { idea: RecipeIdea; featured?: boolean; expanded: boolean; onExpand: () => void; saved: boolean; disabled: boolean; onSave: () => void; onEdit: () => void; onPrepare: () => void; onPlan: () => void };
export function DiscoverRecipe({ idea, featured = false, expanded, onExpand, saved, disabled, onSave, onEdit, onPrepare, onPlan }: RecipeProps) {
  const { width, fontScale } = useWindowDimensions();
  const cover = featured && !expanded && width >= 360 && fontScale < 1.4;
  const compactDetails = expanded && width / fontScale < 360;
  const [showNotes, setShowNotes] = useState(false), [detail, setDetail] = useState<'ingredients' | 'method'>('ingredients');
  const nutrition = recipePortion(idea.recipe), paper = recipePaper(idea);
  return <View testID={`idea-${idea.slug}`} style={{ borderBottomWidth: cover ? 0 : 1, borderColor: colors.line, paddingVertical: cover ? 4 : 12, marginBottom: cover ? 12 : 0 }}>
    {cover ? <View testID="featured-recipe" style={{ backgroundColor: paper, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#A5AF95' }}>
      <View>
        <Pressable accessibilityRole="button" accessibilityLabel={`View recipe ${idea.name}`} onPress={onExpand} style={({ pressed }) => ({ padding: 18, minHeight: 170, opacity: pressed ? .7 : 1 })}>
          <View style={{ position: 'absolute', right: -29, top: 21 }}><RecipeArtwork idea={idea} size={175} /></View>
          <View style={{ paddingRight: 100, gap: 12 }}><Text style={{ fontSize: 10, color: '#46503A', letterSpacing: 1, fontWeight: '600' }}>{idea.mealPrep ? 'BATCH COOKING' : idea.occasion.toUpperCase()}</Text><Text style={{ fontFamily: serif, fontSize: 34, lineHeight: 35, color: '#252B22', letterSpacing: -.6, fontWeight: '600' }}>{idea.name}</Text><Text style={{ fontSize: 12, color: '#46503A' }}>{idea.minutes} min · {idea.servings} servings</Text></View>
        </Pressable>
        <View style={{ position: 'absolute', right: 7, top: 7 }}><Pressable accessibilityRole="button" accessibilityLabel={`${saved ? 'Open saved recipe' : 'Save recipe'} ${idea.name}`} disabled={disabled} onPress={saved ? onEdit : onSave} style={({ pressed }) => ({ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: pressed ? '#A8B391' : '#D4DBC4', opacity: disabled ? .5 : 1 })}><Icon name={saved ? 'check' : 'bookmark'} size={17} color="#333D2B" /></Pressable></View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingLeft: 18, paddingRight: 7, paddingVertical: 5, borderTopWidth: 1, borderColor: '#A1AC90' }}>
        <View style={{ flex: 1, gap: 3 }}><Text style={{ color: '#303A28', fontSize: 13, fontWeight: '600' }}>{display(nutrition.protein)} g protein</Text><Text style={{ color: '#46503A', fontSize: 11 }}>{display(nutrition.kcal, 0)} kcal / serving</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Prepare ${idea.name}`} disabled={disabled} onPress={onPrepare} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 9, backgroundColor: pressed ? '#9AA787' : '#D4DBC4', opacity: disabled ? .5 : 1 })}><Text style={{ color: '#303A28', fontSize: 13, fontWeight: '600' }}>Prepare</Text><Icon name="next" size={15} color="#303A28" /></Pressable>
      </View>
    </View> : <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Close' : 'View'} recipe ${idea.name}`} accessibilityState={{ expanded }} onPress={onExpand} style={({ pressed }) => ({ flex: 1, flexDirection: 'row', gap: 13, minHeight: 84, alignItems: 'center', opacity: pressed ? .65 : 1 })}>
        {!compactDetails && <View style={{ width: 75, height: 84, backgroundColor: paper, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}><RecipeArtwork idea={idea} size={88} /></View>}
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}><Text style={{ fontFamily: expanded ? serif : undefined, fontSize: expanded ? 26 : 18, lineHeight: expanded ? 28 : 22, fontWeight: '600', letterSpacing: -.35 }}>{idea.name}</Text><Text style={{ fontSize: 12, color: colors.secondary }}>{idea.minutes} min · {display(nutrition.kcal, 0)} kcal</Text><Text style={{ fontSize: 12, color: colors.citrus }}>{display(nutrition.protein)} g protein<Text style={{ color: colors.secondary }}> · {display(nutrition.fiber)} g fiber</Text></Text></View>
      </Pressable>
      <IconButton name={expanded ? 'close' : saved ? 'check' : 'bookmark'} label={expanded ? `Close recipe details ${idea.name}` : `${saved ? 'Open saved recipe' : 'Save recipe'} ${idea.name}`} onPress={expanded ? onExpand : saved ? onEdit : onSave} disabled={disabled} />
    </View>}
    {expanded && <Reveal trigger={idea.slug} style={{ paddingTop: 14, gap: 12 }}>
      <Text style={{ fontSize: 14, lineHeight: 20, color: colors.secondary }}>{idea.description}</Text>
      <DiscoverNutrition value={nutrition} caption={`Per serving · original recipe makes ${idea.servings}`} />
      <View style={{ flexDirection: 'row', gap: 9, flexWrap: 'wrap' }}><Button compact label="Plan meal" icon="calendar" onPress={onPlan} disabled={disabled} /><Button compact primary label="Prepare batch" icon="bowl" onPress={onPrepare} disabled={disabled} /><Button compact label={saved ? 'Open saved copy' : 'Save recipe'} icon={saved ? 'book' : 'bookmark'} onPress={saved ? onEdit : onSave} disabled={disabled} /></View>
      <View style={{ flexDirection: 'row', gap: 18 }}><DiscoverMode label="Recipe ingredients" count={idea.recipe.ingredients.length} selected={detail === 'ingredients'} onPress={() => setDetail('ingredients')} /><DiscoverMode label="Recipe method" count={idea.recipe.steps.length} selected={detail === 'method'} onPress={() => setDetail('method')} /></View>
      {detail === 'ingredients' ? <View><Text style={{ color: colors.secondary, fontSize: 11, marginBottom: 5 }}>Whole recipe · use the stated raw, dry or drained weights</Text>{idea.recipe.ingredients.map(i => <View key={i.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderColor: colors.line }}><Text style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>{foodLabel(i.food)}</Text><Text style={{ fontSize: 14, fontWeight: '500' }}>{display(i.quantity, 0)} {i.unit}</Text></View>)}</View> : <View style={{ gap: 18 }}>{idea.recipe.steps.map((step, i) => <View key={i} style={{ flexDirection: 'row', gap: 12 }}><Text style={{ width: 23, color: colors.citrus, fontSize: 22, fontFamily: serif }}>{i + 1}</Text><Text style={{ flex: 1, fontSize: 14, lineHeight: 22 }}>{step}</Text></View>)}</View>}
      <TextButton label={showNotes ? 'Hide storage & sources' : 'Storage & nutrition sources'} onPress={() => setShowNotes(!showNotes)} />
      {showNotes && <View style={{ gap: 9, padding: 14, backgroundColor: colors.surface, borderRadius: 10 }}><Text style={styles.subtitle}>{recipeStorageNote}</Text><Text style={{ fontSize: 12, lineHeight: 19, color: colors.secondary }}>Original Touche Grasse recipe. Nutrition uses the listed Matvaretabellen records. Save a copy to change products; add measured cooked weight for gram portions. Saving and preparing do not log food as eaten.</Text><TextButton label="Food storage guidance · Mattilsynet" onPress={() => void Linking.openURL(recipeSources.storage).catch(() => undefined)} /><TextButton label="Safe cooking temperatures" onPress={() => void Linking.openURL(recipeSources.cooking).catch(() => undefined)} /><TextButton label="Norwegian dietary guidance" onPress={() => void Linking.openURL(recipeSources.dietary).catch(() => undefined)} /></View>}
    </Reveal>}
  </View>;
}

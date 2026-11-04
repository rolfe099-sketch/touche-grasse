import { useState } from 'react';

import { Image, Pressable, View } from 'react-native';

import { router } from 'expo-router';

import { display, recipePortion } from '../../src/domain/model';

import { useApp } from '../../src/state/AppContext';

import { Button, SegmentButton, FoodRow, IconButton, Screen, styles, TextButton } from '../../src/ui/components';

import { Text, TextInput } from '../../src/ui/Text';

import { Icon } from '../../src/ui/Icon';

import { colors } from '../../src/ui/theme';

import { SavedPortionList } from '../../src/ui/Portions';

import { plural } from '../../src/i18n';

import { foodLabel } from '../../src/domain/foodLanguage';

export default function Recipes() {

  const app = useApp();

  const [section, setSection] = useState<'all' | 'recipes' | 'foods' | 'portions'>('all'), [query, setQuery] = useState('');

  const recipes = [...app.repo.recipes].filter(recipe => recipe.name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, 'en'));

  const foods = query.trim() ? app.repo.index.search(query, true) : app.repo.foods;

  return <Screen support title="Library" trailing={<IconButton name="plus" label="New recipe" onPress={() => router.push('/recipe')} />}>

    <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }]}><Icon name="search" size={20} /><TextInput accessibilityLabel="Search your library" placeholder="Recipes, foods, portions" value={query} onChangeText={setQuery} style={{ flex: 1, minHeight: 28 }} /></View>

    <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, padding: 4, marginBottom: 14 }}>{(['all', 'recipes', 'foods', 'portions'] as const).map(value => <SegmentButton key={value} label={value === 'all' ? 'Everything' : value[0].toUpperCase() + value.slice(1)} accessibilityLabel={`Library ${value}`} selected={section === value} onPress={() => setSection(value)} />)}</View>

    {(section === 'all' || section === 'portions') && <SavedPortionList query={query} />}

    {(section === 'all' || section === 'recipes') && <>

    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 3, marginBottom: 5 }}><Text style={styles.subtitle}>{plural(recipes.length, 'recipe')}</Text><TextButton label={app.repo.recipeDrafts.new ? 'Continue draft →' : 'New recipe →'} onPress={() => router.push('/recipe')} /></View>

    {!recipes.length && <View style={{ paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.line, marginBottom: 15 }}><Text style={{ fontWeight: '700', fontSize: 25, marginBottom: 6 }}>{query ? 'No recipes found' : 'Your recipes'}</Text><Text style={[styles.subtitle, { marginBottom: 14 }]}>Keep ingredients, instructions and portions together.</Text><Button label="Create a recipe" icon="plus" onPress={() => router.push('/recipe')} /></View>}

    {recipes.map((recipe, i) => <View key={recipe.id} style={{ borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 13 }}>

      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Pressable accessibilityRole="button" accessibilityLabel={`Open recipe ${recipe.name}`} onPress={() => router.push({ pathname: '/recipe', params: { id: recipe.id } })} style={({ pressed }) => ({ flex: 1, flexDirection: 'row', gap: 12, opacity: pressed ? 0.65 : 1 })}>

        {recipe.photo ? <Image source={{ uri: recipe.photo }} accessibilityLabel={`Your photo of ${recipe.name}`} style={{ width: 55, height: 70, borderRadius: 5 }} /> : <View style={{ width: 35, borderTopWidth: 3, borderColor: [colors.forrest, colors.toffee, colors.ocean][i % 3], paddingTop: 8 }}><Text style={{ fontSize: 22, color: colors.secondary }}>{String(i + 1).padStart(2, '0')}</Text></View>}

        <View style={{ flex: 1, justifyContent: 'center' }}><Text style={{ fontSize: 23, fontWeight: '700', lineHeight: 26, marginBottom: 5 }}>{recipe.name}</Text><Text style={{ fontSize: 12, color: colors.secondary }}>{display(recipe.servings)} servings · {display(recipePortion(recipe).kcal, 0)} kcal each</Text><Text numberOfLines={1} style={{ fontSize: 11, color: colors.secondary, marginTop: 4 }}>{recipe.ingredients.map(ingredient => foodLabel(ingredient.food).split(' · ')[0]).join(', ')}</Text></View>

      </Pressable><Button label="Log 1" icon="plus" compact accessibilityLabel="Log one serving" disabled={app.busy} onPress={() => void app.run(() => app.repo.logRecipe(recipe), 'One serving logged')} /></View>

      <View style={{ flexDirection: 'row', gap: 16, marginLeft: recipe.photo ? 67 : 47, marginTop: 3, alignItems: 'center' }}><IconButton name={recipe.favorite ? 'check' : 'bookmark'} label={`${recipe.favorite ? 'Unfavourite' : 'Favourite'} ${recipe.name}`} onPress={() => void app.run(() => app.repo.saveRecipe({ ...recipe, favorite: !recipe.favorite }))} /><TextButton label="Edit" onPress={() => router.push({ pathname: '/recipe', params: { id: recipe.id } })} /></View>

    </View>)}</>}

    {(section === 'all' || section === 'foods') && <><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}><Text style={{ fontWeight: '700', fontSize: 25 }}>Personal foods</Text><TextButton label="Create a food" onPress={() => router.push('/manual')} /></View>{foods.length ? foods.map(food => <FoodRow key={food.id} food={food} saved onEdit={food.provenance.source !== 'matvaretabellen' ? () => router.push({ pathname: '/manual', params: { edit: food.id } }) : undefined} onSelect={() => { app.setDraft({ ...app.draft, lines: [...app.draft.lines, { id: app.repo.id(), query: food.name, quantityText: '100', unit: food.referenceUnit, food }] }); router.push('/entry'); }} />) : <Text style={{ color: colors.secondary, fontSize: 14, paddingVertical: 10 }}>Foods you save or log will appear here.</Text>}</>}

  </Screen>;

}


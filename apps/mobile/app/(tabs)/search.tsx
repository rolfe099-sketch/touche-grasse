import { useMemo, useState } from 'react';
import { FlatList, Keyboard, ScrollView, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Food } from '../../src/domain/model';
import { discoverFoods, emptyNutritionRule, FoodSort, ingredientCategories, NutritionRule, nutritionRuleError } from '../../src/domain/discoverFoods';
import { findRecipeIdeas, IdeaFilter, ideaFilters, RecipeIdea, recipeIdeaCopyId, recipeIdeas } from '../../src/domain/recipeIdeas';
import { useApp } from '../../src/state/AppContext';
import { Button, Field, IconButton, Screen, styles, TextButton } from '../../src/ui/components';
import { DiscoverChip, DiscoverMode } from '../../src/ui/DiscoverControls';
import { DiscoverFood, DiscoverRecipe } from '../../src/ui/Discover';
import { SearchField } from '../../src/ui/SearchField';
import { Text } from '../../src/ui/Text';
import { colors, serif } from '../../src/ui/theme';

export default function Search() {
  const { width, fontScale } = useWindowDimensions(), compact = width / fontScale < 360;
  const app = useApp(), { repo, revision, draft, setDraft } = app;
  const params = useLocalSearchParams<{ view?: string }>();
  const [mode, setMode] = useState<'foods' | 'ideas'>(params.view === 'ingredients' ? 'foods' : 'ideas');
  const [savedOnly, setSavedOnly] = useState(false);
  const [query, setQuery] = useState(''), [ideaQuery, setIdeaQuery] = useState('');
  const [category, setCategory] = useState('Ingredients'), [sort, setSort] = useState<FoodSort>('Relevant');
  const [filterOpen, setFilterOpen] = useState(false), [rule, setRule] = useState<NutritionRule>(emptyNutritionRule);
  const [ideaFilter, setIdeaFilter] = useState<IdeaFilter>('All ideas');
  const [openFood, setOpenFood] = useState<string>(), [openIdea, setOpenIdea] = useState<string>();
  const results = useMemo(() => { void revision; return discoverFoods(repo.index, query, category, sort, rule); }, [repo, revision, query, category, sort, rule]);
  const savedIds = useMemo(() => { void revision; return new Set(repo.recipes.map(r => r.id)); }, [repo, revision]);
  const savedCount = recipeIdeas.filter(i => savedIds.has(recipeIdeaCopyId(i.recipe))).length;
  const ideas = useMemo(() => findRecipeIdeas(recipeIdeas, ideaQuery, ideaFilter).filter(i => !savedOnly || savedIds.has(recipeIdeaCopyId(i.recipe))), [ideaQuery, ideaFilter, savedOnly, savedIds]);
  const filtered = !!rule.minimum.trim() || !!rule.maximum.trim() || sort !== 'Relevant';
  const filterError = nutritionRuleError(rule);
  function select(food: Food, quantity = '100') {
    setDraft({ ...draft, lines: [...draft.lines, { id: repo.id(), query: food.name, quantityText: quantity, unit: food.referenceUnit, food }] }); router.push('/entry');
  }
  async function saveIdea(idea: RecipeIdea, action: 'save' | 'edit' | 'prepare') {
    const ok = await app.run(() => repo.saveRecipeIdea(idea.recipe), action === 'save' ? 'Recipe saved to Library' : undefined);
    if (ok && action !== 'save') router.push({ pathname: '/recipe', params: { id: recipeIdeaCopyId(idea.recipe), ...(action === 'prepare' ? { prepare: '1' } : {}) } });
  }
  const foodHeader = <View style={{ gap: 10, paddingBottom: 8 }}>
    <SearchField label="Search foods" testID="search-input" placeholder="Norwegian or English food name" value={query} onChangeText={value => { setQuery(value); setCategory('Ingredients'); setOpenFood(undefined); }} clearLabel="Clear food search" hint="Search verified foods in English or Norwegian." />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }} keyboardShouldPersistTaps="handled">
      {ingredientCategories.map(c => <DiscoverChip key={c.name} label={c.name} accessibilityLabel={`Explore ${c.name}`} selected={category === c.name && !query} onPress={() => { setCategory(c.name); setQuery(''); setOpenFood(undefined); }} />)}
    </ScrollView>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <Text style={{ color: colors.secondary, fontSize: 12, flex: 1 }}>{query ? `${results.length} matches` : `${results.length} ingredient picks`} · {repo.index.size.toLocaleString('en')} foods to search</Text>
      <TextButton label={filterOpen ? 'Hide filters' : filtered ? 'Filters on' : 'Nutrition filters'} onPress={() => setFilterOpen(!filterOpen)} />
    </View>
    {filterOpen && <View testID="food-filters" style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 12, gap: 9 }}>
      <Text style={{ fontSize: 12, color: colors.secondary }}>Compare the same reference amount</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>{(['g', 'ml'] as const).map(basis => <Button key={basis} label={`Per 100 ${basis}`} compact selected={rule.basis === basis} onPress={() => setRule({ ...rule, basis })} />)}</View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
        {(['protein', 'carbohydrate', 'fat', 'fiber', 'kcal'] as const).map((nutrient, i) => <Button key={nutrient} label={['Protein', 'Carbs', 'Fat', 'Fiber', 'Calories'][i]} compact selected={rule.nutrient === nutrient} onPress={() => setRule({ ...rule, nutrient })} />)}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Field compact label={`Minimum ${rule.nutrient === 'kcal' ? 'kcal' : 'g'}`} value={rule.minimum} placeholder="No minimum" keyboardType="decimal-pad" onChangeText={minimum => setRule({ ...rule, minimum })} /></View>
        <View style={{ flex: 1 }}><Field compact label={`Maximum ${rule.nutrient === 'kcal' ? 'kcal' : 'g'}`} value={rule.maximum} placeholder="No maximum" keyboardType="decimal-pad" onChangeText={maximum => setRule({ ...rule, maximum })} /></View>
      </View>
      <Text style={{ color: colors.secondary, fontSize: 12 }}>Sort · protein / fiber highest first, calories lowest first</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{(['Relevant', 'Protein', 'Fiber', 'Calories'] as FoodSort[]).map(value => <Button key={value} label={value} accessibilityLabel={`Sort foods by ${value.toLowerCase()}`} compact selected={sort === value} onPress={() => setSort(value)} />)}</View>
      <TextButton label="Reset nutrition filters" onPress={() => { setRule(emptyNutritionRule); setSort('Relevant'); }} />
    </View>}
    {filtered && !filterError && <Text style={{ fontSize: 12, color: colors.forrest }}>Per 100 {rule.basis} records only · unknown values excluded from limits</Text>}
    {filterError && <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 13 }}>{filterError}</Text>}
  </View>;
  const ideaHeader = <View style={{ gap: 12, paddingBottom: 8 }}>
    <SearchField label="Search meal ideas" placeholder="Find a recipe or ingredient" value={ideaQuery} onChangeText={value => { setIdeaQuery(value); setOpenIdea(undefined); }} clearLabel="Clear recipe search" hint="Search recipes and their ingredients in English or Norwegian." />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }} keyboardShouldPersistTaps="handled">
      {ideaFilters.map(filter => <DiscoverChip key={filter} label={filter} selected={ideaFilter === filter && !savedOnly} onPress={() => { setIdeaFilter(filter); setSavedOnly(false); setOpenIdea(undefined); }} />)}
    </ScrollView>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><Text style={{ color: colors.secondary, fontSize: 11, flex: 1 }}>{savedOnly ? 'Saved ideas' : ideaQuery ? 'Search results' : ideaFilter === 'All ideas' ? 'The recipe collection' : ideaFilter} · {ideas.length}</Text><DiscoverChip label="Saved" accessibilityLabel="Saved recipes" count={savedCount} selected={savedOnly} onPress={() => { setSavedOnly(!savedOnly); setIdeaFilter('All ideas'); setOpenIdea(undefined); }} /></View>
  </View>;
  return <Screen support title="Discover" scroll={false} header={<><View style={{ flex: 1, minWidth: 0 }}><Text accessibilityRole="header" style={{ fontFamily: serif, fontSize: compact ? 32 : 40, lineHeight: compact ? 38 : 43, letterSpacing: -1, fontWeight: '600' }}>Discover</Text></View>{!compact && <IconButton name="camera" label="Quick food entry" onPress={() => router.push('/entry?mode=scan')} />}</>}>
    <View style={{ flexDirection: 'row', marginHorizontal: 22, marginBottom: 16, gap: 20 }}>
      <DiscoverMode label="Meal ideas" count={recipeIdeas.length} selected={mode === 'ideas'} onPress={() => setMode('ideas')} />
      <DiscoverMode label="Ingredients" count={repo.index.size} selected={mode === 'foods'} onPress={() => setMode('foods')} />
    </View>
    {mode === 'foods' ? <FlatList data={results} keyExtractor={f => f.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" initialNumToRender={12} windowSize={5} contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 30 }} ListHeaderComponent={foodHeader}
      renderItem={({ item }) => <DiscoverFood food={item} expanded={openFood === item.id} onExpand={() => { Keyboard.dismiss(); setOpenFood(openFood === item.id ? undefined : item.id); }} onAdd={quantity => select(item, quantity)} disabled={app.busy || draft.lines.length >= 200} saved={repo.index.isSaved(item.id)} onSave={() => void app.run(() => repo.saveFood(item), 'Saved to your library')} />}
      ListEmptyComponent={<View style={{ gap: 10, paddingTop: 15 }}><Text style={styles.body}>{filtered ? 'No foods match these limits.' : 'No matches. Try another name, or add your own food.'}</Text>{filtered && <TextButton label="Clear filters" onPress={() => { setRule(emptyNutritionRule); setSort('Relevant'); }} />}<Button label="Create a food" onPress={() => router.push('/manual')} /></View>}
      ListFooterComponent={<Text style={{ color: colors.secondary, fontSize: 11, lineHeight: 17, marginTop: 20 }}>Curated ingredient picks · Search all foods in English or Norwegian. Source: Matvaretabellen. Raw and cooked weights stay separate.</Text>} />
      : <FlatList data={ideas} keyExtractor={i => i.slug} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" initialNumToRender={8} windowSize={5} contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 30 }} ListHeaderComponent={ideaHeader}
        renderItem={({ item, index }) => <DiscoverRecipe idea={item} featured={index === 0 && !ideaQuery.trim() && ideaFilter === 'All ideas' && !savedOnly} expanded={openIdea === item.slug} onExpand={() => { Keyboard.dismiss(); setOpenIdea(openIdea === item.slug ? undefined : item.slug); }} saved={repo.recipes.some(r => r.id === recipeIdeaCopyId(item.recipe))} disabled={app.busy} onSave={() => void saveIdea(item, 'save')} onEdit={() => void saveIdea(item, 'edit')} onPrepare={() => void saveIdea(item, 'prepare')} />}
        ListEmptyComponent={<View style={{ paddingVertical: 20, gap: 8 }}><Text style={styles.body}>No ideas match. Try another ingredient or filter.</Text><TextButton label="Show all ideas" onPress={() => { setIdeaQuery(''); setIdeaFilter('All ideas'); setSavedOnly(false); }} /></View>}
        ListFooterComponent={<Text style={{ color: colors.secondary, fontSize: 11, lineHeight: 17, marginTop: 20 }}>{recipeIdeas.length} original recipes · Available offline. Cooking times are estimates. Nutrition uses the stated food records; cooked yield is never assumed.</Text>} />}
  </Screen>;
}

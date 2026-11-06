import { SearchField } from '../../src/ui/SearchField';
import { Text } from '../../src/ui/Text';

import { useMemo, useState } from 'react';

import { FlatList, Pressable, View } from 'react-native';

import { router } from 'expo-router';

import { Food } from '../../src/domain/model';

import { useApp } from '../../src/state/AppContext';

import { Button, FoodRow, IconButton, Screen, styles } from '../../src/ui/components';

import { colors } from '../../src/ui/theme';

import { Icon } from '../../src/ui/Icon';

export default function Search() {

  const { repo, revision, draft, setDraft, run } = useApp();

  const [query, setQuery] = useState('');

  const results = useMemo(() => { void revision; return query.trim() ? repo.index.search(query) : ['mvt:03.205', 'mvt:05.016', 'mvt:04.220', 'mvt:06.502', 'mvt:08.019', 'mvt:01.200'].map(id => repo.index.get(id)).filter((food): food is Food => !!food); }, [repo, revision, query]);

  function select(food: Food) { setDraft({ ...draft, lines: [...draft.lines, { id: repo.id(), query: food.name, quantityText: '100', unit: food.referenceUnit, food }] }); router.push('/entry'); }

  return <Screen support title="Discover" scroll={false} trailing={<IconButton name="camera" label="Quick food entry" onPress={() => router.push('/entry?mode=scan')} />}>

    <View style={{ paddingHorizontal: 22, gap: 12, paddingBottom: 12 }}>

      <SearchField label="Search foods" testID="search-input" placeholder="Norwegian or English food name" value={query} onChangeText={setQuery} clearLabel="Clear food search" hint="Search verified foods in English or Norwegian." />

      {!query && <><Text style={{ color: colors.secondary, fontSize: 13 }}>Explore 2,121 Norwegian food records</Text><View style={{ flexDirection: 'row', gap: 7 }}>{[{ name: 'Ingredients', query: 'raw', color: colors.blueWash }, { name: 'Protein', query: 'chicken', color: colors.orangeWash }, { name: 'Pasta & grains', query: 'pasta', color: colors.selection }].map(item => <Pressable key={item.name} accessibilityRole="button" accessibilityLabel={`Explore ${item.name}`} onPress={() => setQuery(item.query)} style={({ pressed }) => ({ flex: 1, backgroundColor: pressed ? colors.pressed : item.color, borderRadius: 10, padding: 12, minHeight: 78, justifyContent: 'space-between', opacity: pressed ? 0.6 : 1 })}><Icon name={item.name === 'Protein' ? 'bowl' : item.name === 'Ingredients' ? 'leaf' : 'discover'} size={21} color={colors.ink} /><Text style={{ fontSize: 11, fontWeight: '600', marginTop: 6 }}>{item.name}</Text></Pressable>)}</View><Text style={{ fontSize: 12, color: colors.secondary, fontWeight: '600' }}>Kitchen essentials</Text></>}

      {!!query && <Text style={styles.subtitle}>{results.length}{results.length === 50 ? '+' : ''} matches</Text>}

    </View>

    <FlatList data={results} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled" initialNumToRender={12} windowSize={5} contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 30 }}

      renderItem={({ item }) => <FoodRow food={item} saved={repo.index.isSaved(item.id)} onSelect={() => select(item)} onSave={() => void run(() => repo.saveFood(item), 'Saved to your library')} />}

      ListEmptyComponent={<View style={{ gap: 16, paddingTop: 24 }}><Text style={styles.body}>No matches. Try another name, or add your own food.</Text><Button label="Create a food" onPress={() => router.push('/manual')} /></View>}

      ListFooterComponent={<Text style={{ color: colors.secondary, fontSize: 11, marginTop: 24 }}>Source: Matvaretabellen · Mattilsynet. Each record keeps its reference amount. Raw and cooked weights stay separate.</Text>} />

  </Screen>;

}


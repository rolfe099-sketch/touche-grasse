import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Draft, LogEntry, display, total } from '../domain/model';
import { normalize } from '../domain/search';
import { repeatAvailability, makeRepeatReview } from '../domain/repeatMeal';
import { useApp } from '../state/AppContext';
import { Button, Field, IconButton, Section, TextButton } from './components';
import { Text } from './Text';
import { colors } from './theme';

export function SaveMealShortcut({ draft, entries }: { draft?: Draft; entries?: LogEntry[] }) {
  const app = useApp(), [open, setOpen] = useState(false), [name, setName] = useState('');
  if (!open) return <TextButton label="Save shortcut" accessibilityLabel="Save meal shortcut" disabled={app.busy} onPress={() => setOpen(true)} />;
  return <View testID="save-shortcut" style={{ paddingVertical: 8, borderTopWidth: 1, borderColor: colors.line }}>
    <Field compact label="Shortcut name" placeholder="My breakfast" value={name} maxLength={80} onChangeText={setName} autoCapitalize="sentences" returnKeyType="done" />
    <View style={{ flexDirection: 'row', gap: 12 }}><Button compact label="Save to Today" disabled={app.busy || !normalize(name)} onPress={() => void app.run(() => draft ? app.repo.saveDraftShortcut(name, draft) : app.repo.saveShortcut(name, entries!), 'Shortcut saved').then(ok => { if (ok) { setOpen(false); setName(''); } })} /><TextButton label="Cancel" onPress={() => setOpen(false)} /></View>
  </View>;
}

export function MealShortcuts({ library = false, query = '', onLogged }: { library?: boolean; query?: string; onLogged?: () => void }) {
  const app = useApp(), { repo } = app;
  const [editing, setEditing] = useState<string>(), [name, setName] = useState(''), [deleted, setDeleted] = useState(false);
  const shortcuts = repo.shortcuts.filter(item => (library || item.pinned) && (deleted ? !!item.deletedAt : !item.deletedAt) && normalize(item.name).includes(normalize(query)));
  if (!library && !shortcuts.length) return null;
  return <View testID={library ? 'library-shortcuts' : 'today-shortcuts'}>
    <Section title="Meal shortcuts">{library ? <TextButton label={deleted ? 'Active' : 'Deleted'} onPress={() => setDeleted(!deleted)} /> : <TextButton label="Edit" accessibilityLabel="Manage meal shortcuts" onPress={() => router.push('/recipes')} />}</Section>
    {!shortcuts.length && <Text style={{ color: colors.secondary, fontSize: 13 }}>Save a resolved meal in Quick Log, or save one from your journal.</Text>}
    {shortcuts.map(item => {
      const availability = repeatAvailability(makeRepeatReview(item.entries, 'availability'), repo.preparedBatches, repo.logs);
      return <View key={item.id} testID="meal-shortcut" style={{ borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600' }}>{item.name}</Text><Text style={{ color: availability ? colors.error : colors.secondary, fontSize: 12 }}>{availability ?? `${display(total(item.entries.map(entry => entry.nutrition)).kcal, 0)} kcal · ${item.entries.length} ${item.entries.length === 1 ? 'food' : 'foods'}`}</Text></View>
          {item.deletedAt ? <TextButton label="Restore" accessibilityLabel={`Restore shortcut ${item.name}`} disabled={app.busy} onPress={() => void app.run(() => repo.changeShortcut(item.id, { deleted: false }), 'Shortcut restored')} /> : <>
            <TextButton label="Adjust" accessibilityLabel={`Adjust shortcut ${item.name}`} disabled={app.busy || !!repo.quickEntry.repeatReview} onPress={() => void app.run(() => repo.startShortcutReview(item.id)).then(ok => { if (ok) router.push('/entry'); })} />
            <Button compact primary label="Log" icon="plus" accessibilityLabel={`Log shortcut ${item.name}`} disabled={app.busy || !!availability} onPress={() => void app.run(() => repo.logShortcut(item.id), `${item.name} logged`).then(ok => { if (ok) onLogged?.(); })} />
          </>}
        </View>
        {library && !item.deletedAt && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TextButton label={item.pinned ? 'Unpin' : 'Pin to Today'} accessibilityLabel={`${item.pinned ? 'Unpin' : 'Pin'} shortcut ${item.name}`} disabled={app.busy} onPress={() => void app.run(() => repo.changeShortcut(item.id, { pinned: !item.pinned }))} />
          <TextButton label="Rename" accessibilityLabel={`Rename shortcut ${item.name}`} onPress={() => { setEditing(editing === item.id ? undefined : item.id); setName(item.name); }} />
          <IconButton name="trash" destructive label={`Delete shortcut ${item.name}`} disabled={app.busy} onPress={() => void app.run(() => repo.changeShortcut(item.id, { deleted: true }), 'Shortcut deleted · restore it under Deleted')} />
        </View>}
        {editing === item.id && !item.deletedAt && <View><Field compact label="New shortcut name" value={name} onChangeText={setName} maxLength={80} /><View style={{ flexDirection: 'row', gap: 12 }}><TextButton label="Save name" disabled={app.busy || !normalize(name)} onPress={() => void app.run(() => repo.saveShortcut(name, item.entries, item.id), 'Shortcut renamed').then(ok => { if (ok) setEditing(undefined); })} /><TextButton label="Cancel rename" onPress={() => setEditing(undefined)} /></View></View>}
      </View>;
    })}
  </View>;
}

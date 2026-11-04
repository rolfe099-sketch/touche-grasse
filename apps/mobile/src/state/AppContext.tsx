import { Text } from '../ui/Text';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import catalog from '../data/catalog.json';
import { Draft, Food } from '../domain/model';
import { Repository } from '../domain/repository';
import { openStorage } from '../storage/open';
import { colors, serif } from '../ui/theme';

type State = { repo: Repository; revision: number; draft: Draft; setDraft: (draft: Draft) => void;
  run: (action: () => Promise<unknown>, success?: string, syncDraft?: boolean) => Promise<boolean>;
  busy: boolean; error: string | null; notice: string | null; clearError: () => void; clearNotice: () => void };
const Context = createContext<State | null>(null);
let boot: Promise<Repository> | undefined;
async function initialize() {
  const repository = new Repository(await openStorage(), () => Crypto.randomUUID());
  await repository.initialize(catalog as Food[]);
  return repository;
}
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [repo, setRepo] = useState<Repository>();
  const [draft, updateDraft] = useState<Draft>();
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  useEffect(() => {
    let active = true;
    boot ??= initialize();
    boot.then(value => { if (active) { setRepo(value); updateDraft(value.draft); } }).catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; };
  }, []);
  if (!repo || !draft) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, backgroundColor: colors.background }}>
    <Text style={{ fontFamily: serif, fontSize: 30, color: colors.ink, marginBottom: 24 }}>Touche Grasse</Text>
    {error ? <Text accessibilityRole="alert" style={{ color: colors.error }}>{error}{'\n'}Reload to try again. Your records are kept.</Text> : <><ActivityIndicator color={colors.action} /><Text style={{ marginTop: 12 }}>Getting your food library ready…</Text></>}
  </View>;
  const run: State['run'] = async (action, success, syncDraft = false) => {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setError(null);
    try {
      await action();
      if (syncDraft) updateDraft(repo.draft);
      setRevision(v => v + 1);
      if (success) { setNotice(success); if (Platform.OS === 'ios') void Haptics.selectionAsync().catch(() => undefined); }
      return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this change.'); return false; }
    finally { locked.current = false; setBusy(false); }
  };
  return <Context.Provider value={{ repo, draft, revision, busy, error, notice, run,
    setDraft(value) { updateDraft(value); void repo.saveDraft(value).catch(reason => setError(reason instanceof Error ? reason.message : 'Your unfinished meal could not be saved.')); },
    clearError: () => setError(null), clearNotice: () => setNotice(null),
  }}>{children}</Context.Provider>;
}
export function useApp() { const value = useContext(Context); if (!value) throw new Error('AppProvider missing'); return value; }

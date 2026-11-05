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
import { RecoveryMeta, RecoveryService } from '../domain/recovery';
import { openRecoveryPort } from '../platform/recovery';
import { LabelForm } from '../domain/nutritionLabel';

type State = { repo: Repository; revision: number; draft: Draft; setDraft: (draft: Draft) => void;
  run: (action: () => Promise<unknown>, success?: string, syncDraft?: boolean) => Promise<boolean>;
  busy: boolean; error: string | null; notice: string | null; noticeUndo: boolean; clearError: () => void; clearNotice: () => void;
  recovery?: RecoveryService; recoveryRevision: number; recoveryError: string | null;
  saveRecovery: (reason?: RecoveryMeta['reason']) => Promise<RecoveryMeta | null>;
  saveRepeatAmounts: (reviewId: string, amounts: string[]) => Promise<void>;
  saveLabelDraft: (key: string, form: LabelForm | null) => Promise<void>;
  restoreBackup: (json: string, recoverMissing?: boolean) => Promise<void> };
const Context = createContext<State | null>(null);
let boot: Promise<Repository> | undefined;
let recoveryBoot: Promise<RecoveryService> | undefined;
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
  const [noticeUndo, setNoticeUndo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<RecoveryService>(), [recoveryRevision, setRecoveryRevision] = useState(0), [recoveryError, setRecoveryError] = useState<string | null>(null);
  const locked = useRef(false);
  useEffect(() => {
    let active = true;
    boot ??= initialize();
    boot.then(value => { if (active) { setRepo(value); updateDraft(value.draft); } }).catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    recoveryBoot ??= openRecoveryPort().then(port => new RecoveryService(port, () => Crypto.randomUUID()));
    recoveryBoot.then(value => { if (active) setRecovery(value); }).catch(() => { if (active) setRecoveryError('On-device recovery is unavailable. You can still export a backup.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!repo || !draft || !recovery) return;
    let active = true;
    // Wait for a quiet moment; normal entry never waits for a backup write.
    const timer = setTimeout(() => {
      void repo.exportJSON().then(json => recovery.save(json)).then(copy => {
        if (active) { setRecoveryError(null); if (copy) setRecoveryRevision(value => value + 1); }
      }).catch(() => { if (active) setRecoveryError('The latest recovery copy could not be saved. Earlier copies are kept. Try exporting a backup.'); });
    }, 3000);
    return () => { active = false; clearTimeout(timer); };
  }, [repo, draft, revision, recovery]);
  if (!repo || !draft) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, backgroundColor: colors.background }}>
    <Text style={{ fontFamily: serif, fontSize: 30, color: colors.ink, marginBottom: 24 }}>Touche Grasse</Text>
    {error ? <Text accessibilityRole="alert" style={{ color: colors.error }}>{error}{'\n'}Reload to try again. Your records are kept.</Text> : <><ActivityIndicator color={colors.action} /><Text style={{ marginTop: 12 }}>Getting your food library ready…</Text></>}
  </View>;
  const run: State['run'] = async (action, success, syncDraft = false) => {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setError(null);
    const previousUndo = JSON.stringify([repo.undo, repo.isDeletionUndo]);
    try {
      await action();
      if (syncDraft) updateDraft(repo.draft);
      setRevision(v => v + 1);
      const undoChanged = previousUndo !== JSON.stringify([repo.undo, repo.isDeletionUndo]);
      if (success) { setNotice(success); setNoticeUndo(undoChanged && !!repo.undo.length); if (Platform.OS === 'ios') void Haptics.selectionAsync().catch(() => undefined); }
      else if (undoChanged) setNoticeUndo(false);
      return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this change.'); return false; }
    finally { locked.current = false; setBusy(false); }
  };
  const saveRecovery: State['saveRecovery'] = async (reason = 'manual') => {
    if (!recovery) throw new Error('On-device recovery is unavailable. Export a backup instead.');
    try { const copy = await recovery.save(await repo.exportJSON(), reason); setRecoveryError(null); setRecoveryRevision(value => value + 1); return copy; }
    catch (reason) { setRecoveryError('The latest recovery copy could not be saved. Earlier copies are kept.'); throw reason; }
  };
  return <Context.Provider value={{ repo, draft, revision, busy, error, notice, noticeUndo, run,
    async saveLabelDraft(key, form) { await repo.saveLabelDraft(key, form); setRevision(value => value + 1); },
    async saveRepeatAmounts(reviewId, amounts) {
      try { await repo.saveRepeatAmounts(reviewId, amounts); setRevision(value => value + 1); }
      catch (reason) { setError('Your repeat changes could not be saved. Keep the editor open and retry logging.'); throw reason; }
    },
    recovery, recoveryRevision, recoveryError, saveRecovery,
    async restoreBackup(json, recoverMissing = false) {
      // Recovery is best effort: a backup-storage error must not remove the
      // existing validated merge-restore workflow or erase the active diary.
      if (recovery) { try { await saveRecovery('before-restore'); } catch { /* The Settings recovery status explains the failure. */ } }
      await repo.restoreJSON(json, { recoverMissing });
    },
    setDraft(value) { updateDraft(value); void repo.saveDraft(value).catch(reason => setError(reason instanceof Error ? reason.message : 'Your unfinished meal could not be saved.')); },
    clearError: () => setError(null), clearNotice: () => setNotice(null),
  }}>{children}</Context.Provider>;
}
export function useApp() { const value = useContext(Context); if (!value) throw new Error('AppProvider missing'); return value; }

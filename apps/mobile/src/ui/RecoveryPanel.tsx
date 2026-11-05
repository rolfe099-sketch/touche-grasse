import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { inspectRecoveryJSON, RecoveryCopy, RecoveryMeta } from '../domain/recovery';
import { exportBackup } from '../platform/backup';
import { useApp } from '../state/AppContext';
import { Button, TextButton } from './components';
import { Text } from './Text';
import { colors } from './theme';

export function RecoveryPanel() {
  const app = useApp(), { recovery, recoveryRevision } = app;
  const [copies, setCopies] = useState<RecoveryMeta[]>([]), [pending, setPending] = useState<RecoveryCopy>(), [expanded, setExpanded] = useState(false), [error, setError] = useState('');
  const summary = useMemo(() => pending ? inspectRecoveryJSON(pending.json) : null, [pending]);
  useEffect(() => {
    let active = true;
    if (recovery) void recovery.list().then(values => { if (active) { setCopies(values); setError(''); } }).catch(() => { if (active) setError('Recovery copies could not be listed. Your diary is kept.'); });
    return () => { active = false; };
  }, [recovery, recoveryRevision]);
  return <View testID="recovery-panel" style={{ borderTopWidth: 1, borderColor: colors.line, paddingTop: 12, marginTop: 15, gap: 6 }}>
    <Text style={{ fontSize: 17, fontWeight: '600' }}>On-device recovery</Text>
    <Text style={{ color: colors.secondary, fontSize: 13, lineHeight: 19 }}>Automatic copies after changes, kept separately from the diary. Up to six versions are retained. Export elsewhere to protect against uninstalling, clearing app data or losing your phone.</Text>
    <Text testID="recovery-count" style={{ fontSize: 13 }}>{copies.length ? `${copies.length} ${copies.length === 1 ? 'copy' : 'copies'} available` : 'No recovery copies yet'}</Text>
    {!!(app.recoveryError || error) && <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 12 }}>{app.recoveryError || error}</Text>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}><TextButton label={expanded ? 'Hide recovery copies' : 'View recovery copies'} onPress={() => setExpanded(!expanded)} disabled={!copies.length} /><TextButton label="Create recovery copy now" disabled={app.busy || !recovery} onPress={() => void app.run(() => app.saveRecovery('manual'), 'Recovery copy saved')} /></View>
    {expanded && copies.map(copy => <View key={copy.id} testID="recovery-copy" style={{ borderTopWidth: 1, borderColor: colors.line, paddingVertical: 7 }}>
      <Text style={{ fontSize: 13, fontWeight: '600' }}>{new Date(copy.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</Text>
      <Text style={{ fontSize: 12, color: colors.secondary }}>{copy.reason === 'before-restore' ? 'Before restore' : copy.reason === 'manual' ? 'Manual copy' : 'Automatic copy'} · {Math.max(1, Math.ceil(copy.bytes / 1024))} KB</Text>
      <View style={{ flexDirection: 'row', gap: 20 }}><TextButton label="Recover" accessibilityLabel={`Review recovery ${copy.id}`} disabled={app.busy} onPress={() => void app.run(async () => { if (recovery) setPending(await recovery.read(copy.id)); })} /><TextButton label="Export" accessibilityLabel={`Export recovery ${copy.id}`} disabled={app.busy} onPress={() => void app.run(async () => { if (recovery) await exportBackup((await recovery.read(copy.id)).json); })} /></View>
    </View>)}
    {pending && <View testID="recovery-confirm" style={{ paddingVertical: 10, gap: 8 }}>
      <Text style={{ fontSize: 15, fontWeight: '600' }}>Recover missing records?</Text>
      <Text style={{ fontSize: 13, color: colors.secondary }}>{summary?.logs} diary {summary?.logs === 1 ? 'entry' : 'entries'} · {summary?.recipes} recipes · {summary?.shortcuts} shortcuts · {summary?.reviewedDays} reviewed days in this copy. Existing foods, recipes, historical entries and your current unfinished meal are kept. Missing records are merged from this copy.</Text>
      <Button label="Recover missing records" primary disabled={app.busy} onPress={() => void app.run(() => app.restoreBackup(pending.json, true), 'Recovery merged', true).then(ok => { if (ok) setPending(undefined); })} /><TextButton label="Cancel recovery" disabled={app.busy} onPress={() => setPending(undefined)} />
    </View>}
  </View>;
}

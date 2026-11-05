import { TargetSettings } from '../src/ui/Targets';
import { SupportButton } from '../src/ui/SupportButton';
import { Text } from '../src/ui/Text';
import { useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { useApp } from '../src/state/AppContext';
import { exportBackup, pickBackup } from '../src/platform/backup';
import { Button, Screen, Section, styles, TextButton } from '../src/ui/components';
import { RecoveryPanel } from '../src/ui/RecoveryPanel';
import { inspectRecoveryJSON } from '../src/domain/recovery';

export default function Settings() {
  const app = useApp(); const [pending, setPending] = useState<string>();
  const summary = useMemo(() => pending ? inspectRecoveryJSON(pending) : null, [pending]);
  return <Screen title="Settings" back>
    <Text style={styles.body}>No account. No ads. Your diary and library stay on this device.</Text>
    <Section title="Keep Touche Grasse free" /><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={[styles.subtitle, { flex: 1 }]}>Free to use. If it helps you, you can support its development with a coffee.</Text><SupportButton /></View>
    <Section title="Daily targets" /><TargetSettings />
    <Section title="Backup" /><Text style={[styles.subtitle, { marginBottom: 16 }]}>Take your library, recipes and diary with you. The file contains personal information. You choose where it goes.</Text>
    <View style={{ gap: 12 }}><Button label="Export backup" disabled={app.busy} onPress={() => void app.run(async () => exportBackup(await app.repo.exportJSON()))} />
      <Button label="Choose a backup file" disabled={app.busy} onPress={() => void app.run(async () => { const file = await pickBackup(); if (file) { inspectRecoveryJSON(file); setPending(file); } })} /></View>
    {pending && <View style={{ paddingVertical: 18, gap: 12 }}><Text style={styles.body}>Merge this backup?</Text><Text style={styles.subtitle}>{summary?.logs} diary entries · {summary?.recipes} recipes · {summary?.shortcuts} shortcuts · {summary?.reviewedDays} reviewed days · {summary?.weighIns} weigh-ins · {summary?.mealCorrections} meal corrections</Text><Text style={styles.subtitle}>Existing diary entries and unfinished meals are kept. Matching foods and recipes are updated. Current shortcuts, weigh-ins, day reviews and library archive choices are kept. Export first if you would like an extra copy.</Text>
      <Button label="Confirm restore" primary disabled={app.busy} onPress={() => void app.run(() => app.restoreBackup(pending), 'Backup restored', true).then(ok => { if (ok) setPending(undefined); })} /><Button label="Cancel restore" onPress={() => setPending(undefined)} /></View>}
    <RecoveryPanel />
    <Section title="Food sources" /><Text style={styles.body}>Matvaretabellen · Mattilsynet</Text><Text style={[styles.subtitle, { marginTop: 8, marginBottom: 14 }]}>2,121 foods captured on 22 October 2026. Norwegian names, English aliases and source information stay with each food. Unknown nutrients are shown as –.</Text>
    <Button label="Open source documentation" onPress={() => void Linking.openURL('https://www.matvaretabellen.no/api/')} />
    <Text style={[styles.body, { marginTop: 12 }]}>Open Food Facts</Text><Text style={[styles.subtitle, { fontSize: 13 }]}>Optional barcode data. Check the package before saving; source records and your label corrections remain identified.</Text>
    <View style={{ flexDirection: 'row', gap: 24 }}><TextButton label="Open Food Facts ↗" onPress={() => void Linking.openURL('https://world.openfoodfacts.org/')} /><TextButton label="ODbL license ↗" onPress={() => void Linking.openURL('https://opendatacommons.org/licenses/odbl/1-0/')} /></View>
    <Section title="Local storage" /><Text style={styles.subtitle}>This browser and Expo Go have separate local stores. Export and restore to move your records between them. Private browsing, clearing site data or uninstalling can remove local records.</Text>
  </Screen>;
}

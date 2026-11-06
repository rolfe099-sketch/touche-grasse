import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { dayKey, display, nutrients, parseAmount } from '../domain/model';
import { estimateMaintenance, goalEnergy, GoalDetails, goalSources, startingTargets } from '../domain/goals';
import { macroTargetEnergy, TargetValues, targetValuesSchema } from '../domain/targets';
import { useApp } from '../state/AppContext';
import { Button, Field, Section, styles, TextButton } from './components';
import { Text } from './Text';
import { colors } from './theme';

const labels = { kcal: 'Energy · kcal', protein: 'Protein · g', carbohydrate: 'Carbs · g', fat: 'Fat · g', fiber: 'Fiber · g' };
type Fields = Record<typeof nutrients[number], string>;
const fieldsFor = (v: TargetValues): Fields => Object.fromEntries(nutrients.map(k => [k, v[k] ?? ''])) as Fields;
const valuesFor = (v: Fields): TargetValues => Object.fromEntries(nutrients.map(k => [k, v[k].trim() ? parseAmount(v[k]) : null])) as TargetValues;
export function GoalSettings() {
  const app = useApp(), [open, setOpen] = useState(false), [history, setHistory] = useState(false);
  const current = app.repo.targetFor(dayKey(new Date()));
  return <View>
    <Text style={styles.subtitle}>Set a starting goal and optional training-day targets. Changes start today; earlier days keep their targets.</Text>
    {current?.goalKind && <Text style={[styles.body, { marginTop: 8 }]}>{current.goalKind === 'cut' ? 'Cut' : current.goalKind === 'gain' ? 'Gain' : 'Maintain'} · {current.dayType === 'training' ? 'Training' : 'Rest'} day</Text>}
    {open ? <GoalEditor onClose={() => setOpen(false)} /> : <Button label="Set up a goal" onPress={() => setOpen(true)} />}
    {!!app.repo.goalPrograms.length && <TextButton label={history ? 'Hide goal history' : 'View goal history'} onPress={() => setHistory(!history)} />}
    {history && [...app.repo.goalPrograms].reverse().map(p => <View key={p.id} style={[styles.row, { alignItems: 'flex-start', flexDirection: 'column', gap: 3 }]}><Text style={styles.body}>{p.goal.kind === 'cut' ? 'Cut' : p.goal.kind === 'gain' ? 'Gain' : 'Maintain'} · from {p.effectiveOn}</Text><Text style={styles.subtitle}>Rest {display(p.rest.kcal, 0)} · Training {display(p.training.kcal, 0)} kcal</Text><Text style={styles.subtitle}>{p.trainingDays.length ? p.trainingDays.map(d => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d]).join(', ') : 'Same rest profile every day'}{p.goal.targetWeightKg ? ` · Goal ${p.goal.targetWeightKg} kg` : ''}</Text></View>)}
  </View>;
}
function GoalEditor({ onClose }: { onClose: () => void }) {
  const app = useApp(), [kind, setKind] = useState<GoalDetails['kind']>('maintain'), [maintenance, setMaintenance] = useState(''), [adjustment, setAdjustment] = useState('10'), [weightGoal, setWeightGoal] = useState('');
  const [calculator, setCalculator] = useState(false), [weight, setWeight] = useState(''), [height, setHeight] = useState(''), [age, setAge] = useState(''), [coefficient, setCoefficient] = useState<'male' | 'female'>(), [activity, setActivity] = useState('1.4'), [eligible, setEligible] = useState(false);
  const [review, setReview] = useState<GoalDetails>(), [rest, setRest] = useState<Fields>(), [training, setTraining] = useState<Fields>(), [days, setDays] = useState<number[]>([]), [profile, setProfile] = useState<'rest' | 'training'>('rest'), [error, setError] = useState('');
  const build = () => {
    try {
      if (calculator && !coefficient) throw new Error('Choose an equation coefficient.');
      const estimate = calculator ? { weightKg: parseAmount(weight) ?? '', heightCm: parseAmount(height) ?? '', age: Number(age), coefficient: coefficient!, activityFactor: parseAmount(activity) ?? '', eligibleAdult: eligible as true } : undefined;
      const details: GoalDetails = { kind, maintenanceKcal: estimate ? estimateMaintenance(estimate).maintenanceKcal : parseAmount(maintenance) ?? '', adjustmentPercent: kind === 'maintain' ? '0' : parseAmount(adjustment) ?? '', targetWeightKg: weightGoal.trim() ? parseAmount(weightGoal) ?? '' : null, method: estimate ? 'mifflin-1990' : 'manual', estimate };
      const values = startingTargets(goalEnergy(details)); setRest(fieldsFor(values)); setTraining(fieldsFor(values)); setReview(details); setError('');
    } catch { setError('Check the inputs. The optional estimate supports ages 19–78, 30–350 kg, 100–250 cm and activity factors 1.2–2. Use your own maintenance estimate if this does not fit.'); }
  };
  const invalid = !rest || !training || ![rest, training].every(v => targetValuesSchema.safeParse(valuesFor(v)).success && nutrients.every(k => !v[k].trim() || parseAmount(v[k]) !== null));
  const currentValues = profile === 'rest' ? rest : training;
  const macroEnergy = !invalid && currentValues ? macroTargetEnergy(valuesFor(currentValues)) : null;
  return <View testID="goal-editor" style={{ marginTop: 12, gap: 8, borderTopWidth: 1, borderColor: colors.line, paddingTop: 12 }}>
    {!review ? <>
      <View style={{ flexDirection: 'row', gap: 6 }}>{(['cut', 'maintain', 'gain'] as const).map(k => <Button key={k} compact label={k === 'cut' ? 'Cut' : k === 'gain' ? 'Gain' : 'Maintain'} selected={kind === k} onPress={() => setKind(k)} />)}</View>
      {!calculator && <Field label="Maintenance estimate · kcal / day" value={maintenance} onChangeText={setMaintenance} keyboardType="decimal-pad" />}
      <TextButton label={calculator ? 'Use my own maintenance estimate' : 'Estimate from body measurements'} onPress={() => { setCalculator(!calculator); setError(''); }} />
      {calculator && <><Text style={styles.subtitle}>A generic resting-energy equation multiplied by your activity estimate. It does not measure your expenditure.</Text><Field label="Body weight · kg" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" /><Field label="Height · cm" value={height} onChangeText={setHeight} keyboardType="decimal-pad" /><Field label="Age · years" value={age} onChangeText={setAge} keyboardType="number-pad" /><Text style={styles.subtitle}>Equation coefficient</Text><View style={{ flexDirection: 'row', gap: 6 }}>{(['female', 'male'] as const).map(c => <Button key={c} compact label={c === 'male' ? 'Male coefficient' : 'Female coefficient'} selected={coefficient === c} onPress={() => setCoefficient(c)} />)}</View><Field label="Activity multiplier · 1.2–2" value={activity} onChangeText={setActivity} keyboardType="decimal-pad" /><Button label="I am an adult, not pregnant or breastfeeding" selected={eligible} onPress={() => setEligible(!eligible)} /><TextButton label="Equation source ↗" onPress={() => void Linking.openURL(goalSources.equation)} /></>}
      {kind !== 'maintain' && <Field label={`${kind === 'cut' ? 'Deficit' : 'Surplus'} · % of maintenance (0–20)`} value={adjustment} onChangeText={setAdjustment} keyboardType="decimal-pad" />}
      <Field label="Goal weight · kg (optional)" value={weightGoal} onChangeText={setWeightGoal} keyboardType="decimal-pad" />
      <Button label="Review starting targets" primary disabled={app.busy} onPress={build} />
    </> : <>
      <Text style={{ fontSize: 22, fontWeight: '600' }}>Your starting targets</Text><Text style={styles.subtitle}>Estimated maintenance {review.maintenanceKcal} kcal. The editable template uses 25% protein, 25% fat and the remainder carbs. Set fiber yourself. These are targets, not food nutrition values.</Text>
      <Section title="Training days" /><Text style={styles.subtitle}>Choose recurring weekdays. Unselected days use Rest.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => <Pressable key={d} accessibilityRole="button" accessibilityLabel={d} accessibilityState={{ selected: days.includes(i) }} aria-pressed={days.includes(i)} onPress={() => setDays(days.includes(i) ? days.filter(n => n !== i) : [...days, i].sort())} style={({ pressed }) => ({ width: 44, minHeight: 44, borderRadius: 9, borderWidth: 1, borderColor: days.includes(i) ? colors.action : 'transparent', backgroundColor: pressed ? colors.pressed : days.includes(i) ? colors.selection : colors.raised, alignItems: 'center', justifyContent: 'center' })}><Text style={{ fontSize: 12, fontWeight: '600', color: days.includes(i) ? colors.action : colors.ink }}>{d}</Text></Pressable>)}</View>
      <View style={{ flexDirection: 'row', gap: 8 }}>{(['rest', 'training'] as const).map(p => <Button key={p} label={p === 'rest' ? 'Rest targets' : 'Training targets'} selected={profile === p} onPress={() => setProfile(p)} />)}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{nutrients.map(k => <View key={`${profile}-${k}`} style={{ flexGrow: 1, flexBasis: '45%' }}><Field compact label={`${profile === 'rest' ? 'Rest' : 'Training'} ${labels[k]}`} value={(profile === 'rest' ? rest : training)![k]} onChangeText={v => { const value = { ...(profile === 'rest' ? rest : training)!, [k]: v }; if (profile === 'rest') setRest(value); else setTraining(value); }} keyboardType="decimal-pad" selectTextOnFocus /></View>)}</View>
      {macroEnergy !== null && currentValues?.kcal.trim() && macroEnergy !== parseAmount(currentValues.kcal) && <Text style={styles.subtitle}>Macro targets add up to {display(macroEnergy, 0)} kcal using 4/4/9. Energy and macros will be kept as entered.</Text>}
      <Text style={styles.subtitle}>Blank means no target. Manual daily targets can override this schedule. No automatic adjustments are made.</Text>
      <Button label="Save goal and schedule" primary disabled={invalid || app.busy} onPress={() => void app.run(() => app.repo.saveGoalProgram({ effectiveOn: dayKey(new Date()), goal: review, rest: valuesFor(rest!), training: valuesFor(training!), trainingDays: days }), 'Goal saved from today').then(ok => { if (ok) onClose(); })} />
      <TextButton label="Back to goal inputs" onPress={() => setReview(undefined)} />
    </>}
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.error }}>{error}</Text>}
    <TextButton label="Cancel goal setup" onPress={onClose} />
  </View>;
}

import { describe, expect, it } from 'vitest';
import { emptyTargets, macroTargetEnergy } from '../src/domain/targets';
import { estimateMaintenance, GoalProgram, goalEnergy, goalProgramSchema, resolveTargets, startingTargets, validateNewProgram } from '../src/domain/goals';
import { checkPlanBatch, formItems, MealPlan, planDraftSchema, planIsLogged, plannedNutrition, validatePlan, validatePlanDraft, validatePlans } from '../src/domain/mealPlanning';
import { recipeIdeas } from '../src/domain/recipeIdeas';
import { D, LogEntry, nutrients, PreparedBatch, recipePortion, structuredCopy } from '../src/domain/model';
const at = new Date('2026-11-06T12:00:00Z');
export function program(): GoalProgram { return { id: 'goal', effectiveOn: '2026-11-06', recordedAt: at.toISOString(), goal: { kind: 'cut', maintenanceKcal: '2500', adjustmentPercent: '10', targetWeightKg: null, method: 'manual' }, rest: startingTargets('2250'), training: startingTargets('2450'), trainingDays: [0, 2, 4] }; }
export function plan(): MealPlan { const items: MealPlan['items'] = [{ kind: 'recipe', recipe: structuredCopy(recipeIdeas[0].recipe), quantity: '1', unit: 'servings' }]; return { id: 'plan', date: '2026-11-07', meal: 'Lunsj', name: 'Pasta lunch', items, nutrition: plannedNutrition(items), createdAt: at.toISOString(), updatedAt: at.toISOString(), cancelledAt: null, loggedAt: null, logIds: [], receipts: [] }; }

describe('goal estimates and dated schedules', () => {
  it('uses the published regression, explicit coefficients and user-selected activity factors', () => {
    const input = { weightKg: '80', heightCm: '180', age: 30, coefficient: 'male' as const, activityFactor: '1.4', eligibleAdult: true as const };
    expect(estimateMaintenance(input)).toEqual({ restingKcal: '1781.6', maintenanceKcal: '2494' });
    expect(estimateMaintenance({ ...input, coefficient: 'female' })).toEqual({ restingKcal: '1615.6', maintenanceKcal: '2262' });
    expect(() => estimateMaintenance({ ...input, age: 18 })).toThrow(); expect(() => estimateMaintenance({ ...input, activityFactor: '3' })).toThrow();
    expect(goalEnergy({ ...program().goal, method: 'mifflin-1990', maintenanceKcal: '2494', estimate: input })).toBe('2245');
    expect(() => goalProgramSchema.parse({ ...program(), goal: { ...program().goal, method: 'mifflin-1990' } })).toThrow();
  });
  it('makes cut/maintain/gain estimates transparent and conserves the chosen macro energy exactly', () => {
    const goal = program().goal;
    expect(goalEnergy(goal)).toBe('2250'); expect(goalEnergy({ ...goal, kind: 'gain' })).toBe('2750'); expect(goalEnergy({ ...goal, kind: 'maintain', adjustmentPercent: '0' })).toBe('2500');
    for (const energy of ['1000', '1634', '2245', '2450', '10000']) expect(macroTargetEnergy(startingTargets(energy))).toBe(energy);
    expect(startingTargets('2250').fiber).toBeNull(); expect(() => goalEnergy({ ...goal, adjustmentPercent: '21' })).toThrow();
    expect(() => goalEnergy({ ...goal, maintenanceKcal: '1000', adjustmentPercent: '20' })).toThrow('outside');
  });
  it('resolves Monday-based training days, keeps earlier manual context and supports later phase/manual changes', () => {
    const p = program(), manual = [{ id: 'manual', effectiveOn: '2026-11-01', recordedAt: '2026-11-01T12:00:00Z', values: startingTargets('2100') }];
    expect(resolveTargets(manual, [p], '2026-11-05')!.values.kcal).toBe('2100');
    expect(resolveTargets(manual, [p], '2026-11-06')!.dayType).toBe('training'); expect(resolveTargets(manual, [p], '2026-11-07')!.values.kcal).toBe('2250');
    expect(resolveTargets(manual, [p], '2026-11-09')!.values.kcal).toBe('2450');
    const override = { id: 'override', effectiveOn: p.effectiveOn, recordedAt: '2026-11-06T12:00:00.001Z', values: emptyTargets() };
    expect(resolveTargets([...manual, override], [p], '2026-11-07')!.values).toEqual(emptyTargets());
    const next = { ...p, id: 'phase2', effectiveOn: '2026-11-09', goal: { ...p.goal, kind: 'maintain' as const, adjustmentPercent: '0' } };
    expect(resolveTargets([...manual, override], [p, next], '2026-11-09')!.goalKind).toBe('maintain');
    expect(manual[0].values.kcal).toBe('2100');
  });
  it('rejects duplicate/out-of-range weekdays and protects earlier dates from new program edits', () => {
    expect(() => goalProgramSchema.parse({ ...program(), trainingDays: [0, 0] })).toThrow();
    expect(() => goalProgramSchema.parse({ ...program(), trainingDays: [7] })).toThrow();
    expect(() => validateNewProgram({ ...program(), effectiveOn: '2026-11-05' }, at)).toThrow('Earlier days');
    expect(validateNewProgram(program(), at)).toEqual(program());
    expect(resolveTargets([], [{ ...program(), trainingDays: [] }], '2026-11-06')!.dayType).toBe('rest');
  });
});

describe('planned snapshots are not eaten food', () => {
  it('validates exact source-based nutrition and never invents cooked grams or missing nutrients', () => {
    const p = plan(); expect(validatePlan(p).nutrition).toEqual(recipePortion(recipeIdeas[0].recipe));
    expect(() => validatePlan({ ...p, nutrition: { ...p.nutrition, kcal: '1' } })).toThrow('calculation');
    const item = p.items[0]; if (item.kind !== 'recipe') throw new Error('Fixture');
    const unknown = structuredCopy(item); delete unknown.recipe.ingredients[0].food.nutrition.fiber;
    expect(plannedNutrition([unknown]).fiber).toBeNull();
    expect(() => plannedNutrition([{ ...item, unit: 'g' }])).toThrow('cooked batch weight');
    for (const key of nutrients) expect(p.nutrition[key]).toBe(new D(recipePortion(item.recipe)[key]!).toFixed());
  });
  it('preserves partial editor values but requires complete dates/amounts for a saved plan', () => {
    const p = plan(), form = { name: '', dateText: '2026-', meal: p.meal, items: p.items, amounts: ['1,'] };
    const draft = planDraftSchema.parse({ id: 'draft', value: form }); validatePlanDraft(draft, [], []);
    expect(() => formItems(form)).toThrow('amount'); expect(() => validatePlan({ ...p, date: '2026-' })).toThrow();
    const items = formItems({ ...form, amounts: ['2'] }); expect(plannedNutrition(items).kcal).toBe('1276'); expect(p.items).toEqual(plan().items);
    expect(() => validatePlanDraft({ ...draft, value: { ...form, editingId: 'missing' } }, [], [])).toThrow('missing plan');
  });
  it('checks batch identity and availability separately, allowing plans without reserving portions', () => {
    const p = plan(), item = p.items[0]; if (item.kind !== 'recipe') throw new Error('Fixture');
    const b: PreparedBatch = { id: 'batch', recipe: item.recipe, createdAt: at.toISOString(), meal: p.meal };
    p.sourceBatchId = b.id; const large = { ...p, items: [{ ...item, quantity: '7' }] };
    checkPlanBatch(large, [b]); expect(() => checkPlanBatch(large, [b], [])).toThrow('exceeds');
    expect(() => checkPlanBatch(p, [])).toThrow('missing');
    expect(() => checkPlanBatch({ ...p, items: [{ ...item, recipe: { ...item.recipe, servings: '9' } }] }, [b])).toThrow('snapshot');
  });
  it('retains receipts across Undo so restoring older eaten records cannot authorize duplicate logging', () => {
    const p = plan(); p.receipts = [{ at: at.toISOString(), ids: ['eaten'] }]; validatePlan(p);
    const log = { id: 'eaten' } as LogEntry;
    expect(planIsLogged(p, [])).toBe(false); expect(planIsLogged(p, [log])).toBe(true);
    expect(() => validatePlans([p, { ...p, id: 'other' }], [])).toThrow('duplicate');
    expect(() => validatePlan({ ...p, loggedAt: at.toISOString(), logIds: ['different'] })).toThrow('receipt');
  });
});

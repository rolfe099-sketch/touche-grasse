import { describe, expect, it } from 'vitest';
import { emptyTargets, hasTargets, macroTargetEnergy, targetChangeSchema, targetOn, targetProgress, targetValuesSchema } from '../src/domain/targets';

const values = { kcal: '2000', protein: '150', carbohydrate: '200', fat: '60', fiber: '30' };
describe('optional, dated user targets', () => {
  it('selects the latest applicable revision without applying new goals to earlier dates', () => {
    const first = { id: 'a', effectiveOn: '2026-10-28', recordedAt: '2026-10-28T12:00:00Z', values };
    const later = { ...first, id: 'b', effectiveOn: '2026-11-03', recordedAt: '2026-11-03T12:00:00Z', values: { ...values, kcal: '2300' } };
    const off = { ...later, id: 'c', recordedAt: '2026-11-03T13:00:00Z', values: emptyTargets() };
    expect(targetOn([later, first, off], '2026-10-27')).toBeUndefined();
    expect(targetOn([later, first, off], '2026-11-02')).toEqual(first);
    expect(targetOn([later, first, off], '2026-11-03')).toEqual(off);
    expect(hasTargets(off.values)).toBe(false);
  });
  it('uses exact decimals for remaining amounts and neutral over-target values', () => {
    const nutrition = { kcal: '1116.25', protein: '80.155', carbohydrate: '105.375', fat: '40.115', fiber: '6.135' };
    expect(targetProgress(nutrition, 'fiber', values, true)?.remaining).toBe('23.865');
    expect(targetProgress(nutrition, 'kcal', { ...values, kcal: '1000' }, true)).toEqual({ target: '1000', remaining: '-116.25', fraction: 1 });
    expect(targetProgress(nutrition, 'fiber', emptyTargets(), true)).toBeNull();
  });
  it('does not confuse an empty diary or missing nutrients with zero consumption', () => {
    const zero = { kcal: '0', protein: '0', carbohydrate: '0', fat: '0', fiber: '0' };
    expect(targetProgress(zero, 'kcal', values, false)?.remaining).toBeNull();
    expect(targetProgress({ ...zero, fiber: undefined }, 'fiber', values, true)?.remaining).toBeNull();
    expect(targetProgress(zero, 'fiber', values, true)?.remaining).toBe('30');
  });
  it('validates each optional target and calendar dates', () => {
    expect(targetValuesSchema.parse(emptyTargets())).toEqual(emptyTargets());
    for (const kcal of ['0', '-1', 'NaN', '100001', '1e3', '']) expect(targetValuesSchema.safeParse({ ...values, kcal }).success).toBe(false);
    expect(targetChangeSchema.safeParse({ id: 'a', effectiveOn: '2026-02-30', recordedAt: '2026-02-28T12:00:00Z', values }).success).toBe(false);
  });
  it('reports a macro/energy mismatch without changing either choice or adding fiber energy', () => {
    expect(macroTargetEnergy(values)).toBe('1940');
    expect(values.kcal).toBe('2000');
    expect(macroTargetEnergy({ ...values, fiber: '100' })).toBe('1940');
    expect(macroTargetEnergy({ ...values, fat: null })).toBeNull();
  });
});

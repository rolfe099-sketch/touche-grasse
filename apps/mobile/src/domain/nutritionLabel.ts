import { z } from 'zod';
import { D, decimalSchema, Food, nutrients, nutritionSchema, parseAmount, validateFood } from './model';

const labelBlocksSchema = z.array(z.object({ text: z.string().max(3000), confidence: z.number().min(0).max(100).nullable(),
  box: z.object({ x: z.number().finite(), y: z.number().finite(), width: z.number().nonnegative().finite(), height: z.number().nonnegative().finite() }).nullable() })).max(2000);
export const labelDocumentSchema = z.object({ engine: z.enum(['platform', 'tesseract']), text: z.string().max(30000), blocks: labelBlocksSchema,
  alternative: z.object({ text: z.string().max(30000), blocks: labelBlocksSchema }).optional() });
export type LabelDocument = z.infer<typeof labelDocumentSchema>;
export const labelColumnSchema = z.object({ title: z.string().max(300), amount: decimalSchema, unit: z.enum(['g', 'ml']), prepared: z.boolean(),
  nutrition: nutritionSchema, evidence: z.record(z.string(), z.string().max(1000)), issues: z.record(z.string(), z.string().max(300)), suggestions: z.record(z.string(), decimalSchema).optional() });
export const labelCandidateSchema = z.object({ engine: z.enum(['platform', 'tesseract']), scannedAt: z.iso.datetime(), text: z.string().max(30000), columns: z.array(labelColumnSchema).max(8), notice: z.string().max(300).optional(), parserVersion: z.number().int().min(1).max(100).optional() });
export type LabelCandidate = z.infer<typeof labelCandidateSchema>;
export const labelFormSchema = z.object({ id: z.string().max(200), name: z.string().max(300), barcode: z.string().max(30), basis: z.enum(['g', 'ml']),
  values: z.object({ kcal: z.string().max(100), protein: z.string().max(100), carbohydrate: z.string().max(100), fat: z.string().max(100), fiber: z.string().max(100) }),
  amount: z.string().max(100), scan: labelCandidateSchema.optional(), column: z.number().int().min(0).max(7).optional() });
export type LabelForm = z.infer<typeof labelFormSchema>;
const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/æ/g, 'ae').replace(/ø/g, 'o');
const labels: [typeof nutrients[number], RegExp][] = [ ['kcal', /^(?:energy|energi)\b/i], ['protein', /^(?:protein(?:er)?)\b/i], ['carbohydrate', /^(?:carbohydrates?|karbohydrat(?:er)?|carbs)\b/i], ['fat', /^(?:total\s+)?(?:fat|fett)\b/i], ['fiber', /^(?:dietary\s+)?(?:fibre|fiber|kostfiber)\b/i] ];
const nutrient = (text: string) => labels.find(([, re]) => re.test(fold(text).trim()));
export const isNutrientHeading = (text: string) => !!nutrient(text);
function rows(document: LabelDocument) {
  if (!document.blocks.length) return document.text.split(/\r?\n/).map(text => ({ text, confidence: null as number | null }));
  const grouped: { parts: LabelDocument['blocks']; y: number; height: number }[] = [], output: { text: string; confidence: number | null }[] = [];
  const flush = () => {
    output.push(...grouped.sort((a, b) => a.y - b.y).map(row => ({ text: row.parts.sort((a, b) => a.box!.x - b.box!.x).map(p => p.text).join(' '), confidence: row.parts.some(p => p.confidence !== null) ? Math.min(...row.parts.map(p => p.confidence ?? 100)) : null })));
    grouped.length = 0;
  };
  for (const rawBlock of document.blocks) {
    const block = { ...rawBlock, text: rawBlock.text.trim() }; if (!block.text) continue;
    // Unpositioned/paragraph observations are ordering barriers. Appending them
    // after the whole table separates headings from their original values.
    if (!block.box || block.text.includes('\n') || block.box.height === 0) { flush(); output.push(...block.text.split(/\r?\n/).map(text => ({ text, confidence: block.confidence }))); continue; }
    const center = block.box.y + block.box.height / 2;
    const row = grouped.find(row => Math.abs(row.y - center) < Math.min(row.height, block.box!.height) * .45);
    if (row) row.parts.push(block); else grouped.push({ parts: [block], y: center, height: block.box.height });
  }
  flush();
  return output.map(row => ({ ...row, text: row.text.trim() })).filter(row => row.text);
}
function printedEnergy(text: string, unit: 'kj' | 'kcal') {
  return [...fold(text).matchAll(/(?<![\w.,])(\d+(?:[.,]\d+)?)\s*(kcal|kj)\b/g)].filter(match => match[2] === unit).map(match => parseAmount(match[1]));
}
export function parseNutritionLabel(input: LabelDocument, scannedAt = new Date().toISOString()): LabelCandidate {
  const document = labelDocumentSchema.parse(input), lines = rows(document), columns: LabelCandidate['columns'] = [];
  const firstNutrient = lines.findIndex(row => nutrient(row.text));
  for (const row of lines.slice(0, firstNutrient < 0 ? lines.length : firstNutrient)) {
    const text = fold(row.text), header = /(?:\b(?:per|pr\.?|for)\s*(?:(?:serving|portion|porsjon)\s*[:(]?\s*)?)(\d+(?:[.,]\d+)?)\s*(g|ml)\b|^\s*(100)\s*(g|ml)\s*$/gi;
    const matches = [...text.matchAll(header)];
    for (const [i, match] of matches.entries()) {
      const amount = parseAmount(match[1] ?? match[3]), unit = (match[2] ?? match[4]) as 'g' | 'ml';
      if (!amount || new D(amount).lte(0) || new D(amount).gt(1000000) || columns.length >= 8) continue;
      const part = text.slice(match.index, matches[i + 1]?.index ?? text.length), prepared = /prepared|tilberedt|cooked|ferdiglaget/.test(part);
      if (columns.some(col => col.amount === amount && col.unit === unit && col.prepared === prepared)) continue;
      columns.push({ title: `Per ${amount} ${unit}${prepared ? ' · prepared' : ''}`, amount, unit, prepared,
        nutrition: { kcal: null, protein: null, carbohydrate: null, fat: null, fiber: null }, evidence: {}, issues: {} });
    }
  }
  // Vision can return a heading and its values in separate observations. Join
  // only immediately adjacent numeric/unit rows, stopping at every other label.
  const numericRow = (text: string) => {
    const unit = /(?<![a-z])(?:kcal|kj|mg|ug|µg|μg|g)(?![a-z])/g, hasUnit = unit.test(fold(text)); unit.lastIndex = 0;
    const rest = fold(text).replace(unit, '');
    return /^[\d\s.,/|<>≤≥≈~?%+−-]*$/.test(rest) && (/\d/.test(rest) || hasUnit || /^[/|<>≤≥≈~?%−-]+$/.test(rest.trim()));
  };
  for (const [position, source] of lines.entries()) {
    const row = { ...source };
    const found = nutrient(row.text); if (!found || !columns.length) continue;
    for (let i = position + 1; i < Math.min(lines.length, position + 17) && numericRow(lines[i].text); i++) {
      row.text += ' ' + lines[i].text;
      if (lines[i].confidence !== null) row.confidence = Math.min(row.confidence ?? 100, lines[i].confidence!);
    }
    const [key, re] = found; let rest = fold(row.text).replace(re, '').trim();
    if (/of which|hvorav|saturat|mettede|sugar|sukker/.test(rest)) continue;
    const declaredUnits = /^\s*(?:[([]\s*(kj\s*\/\s*kcal|kcal\s*\/\s*kj|kcal|kj|mg|g)\s*[)\]]\s*[:=]?\s*|(kj\s*\/\s*kcal|kcal\s*\/\s*kj|kcal|kj|mg|g)\s*[:=]?\s+)/.exec(rest);
    if (declaredUnits) {
      const units = (declaredUnits[1] ?? declaredUnits[2]).split('/').map(unit => unit.trim()), values = rest.slice(declaredUnits[0].length);
      const bare = values.split(/[\s|/]+/).filter(Boolean);
      if (bare.length === columns.length * units.length && bare.every(value => /^\d+(?:[.,]\d+)?$/.test(value))) rest = bare.map((value, i) => `${value} ${units[i % units.length]}`).join(' ');
    }
    let tokens: { value: string; unit: string }[] = [];
    const unsafe = /[<>≤≥≈~?]|(?:^|\s)-\s*\d|\d\s+\d|\d[oOilI]|[oOilI]\d|\d[.,]\s+\d|\d\s*%|\b(?:about|ca\.)/.test(rest);
    if (key === 'kcal') {
      const all = [...rest.matchAll(/(?<![\w.,])(\d+(?:[.,]\d+)?)\s*(kcal|kj)\b/gi)];
      const kcal = all.filter(m => m[2] === 'kcal'), kj = all.filter(m => m[2] === 'kj');
      tokens = (kcal.length ? kcal : kj).map(m => ({ value: m[1], unit: m[2] }));
    } else {
      tokens = [...rest.replace(/\(\s*g\s*\)/g, '').matchAll(/(?<![\w.,])(\d+(?:[.,]\d+)?)\s*(mg|ug|µg|μg|g)\b/gi)].map(m => ({ value: m[1], unit: m[2] }));
    }
    const uncertain = unsafe || (row.confidence !== null && row.confidence < 80) || tokens.length !== columns.length;
    columns.forEach((column, index) => {
      column.evidence[key] = row.text.slice(0, 1000);
      if (uncertain) {
        column.nutrition[key] = null; column.issues[key] = /[<>≤≥≈~?]|(?:^|\s)-\s*\d|\d\s*%/.test(rest) ? 'Bounded or uncertain label value · enter manually' : tokens.length > columns.length ? 'Ambiguous column alignment · enter manually' : 'Check this reading on the label';
        if (key !== 'kcal' && columns.length === 1 && !unsafe && (row.confidence === null || row.confidence >= 80) && /^\d+(?:[.,]\d+)?$/.test(rest)) {
          const value = new D(rest.replace(',', '.')).times(100).div(column.amount);
          if (value.lte(column.unit === 'g' ? 100 : 10000)) { column.suggestions ??= {}; column.suggestions[key] = value.toFixed(); column.issues[key] = 'Unit not read · confirm grams on the package'; }
        }
        return;
      }
      const token = tokens[index], parsed = parseAmount(token.value);
      if (parsed === null) { column.issues[key] = 'Check this number'; return; }
      let value = new D(parsed);
      if (token.unit === 'kj') value = value.div('4.184');
      else if (token.unit === 'mg') value = value.div(1000);
      else if (token.unit === 'ug' || token.unit === 'µg' || token.unit === 'μg') value = value.div(1000000);
      value = value.times(100).div(column.amount);
      const limit = key === 'kcal' ? (column.unit === 'g' ? 1000 : 10000) : (column.unit === 'g' ? 100 : 10000);
      if (value.gt(limit)) { column.nutrition[key] = null; column.issues[key] = 'Value exceeds the reference amount'; return; }
      if (column.issues[key] || (column.nutrition[key] !== null && !new D(column.nutrition[key]!).eq(value))) { column.nutrition[key] = null; column.issues[key] = 'Conflicting readings · enter the label value'; return; }
      column.nutrition[key] = value.toFixed();
    });
  }
  const result = labelCandidateSchema.parse({ engine: document.engine, scannedAt, text: document.text, columns, parserVersion: 2 });
  if (!document.alternative) return result;
  const alternate = parseNutritionLabel({ engine: document.engine, ...document.alternative }, scannedAt);
  result.text = [document.text, 'Second OCR reading:', document.alternative.text].join('\n').slice(0, 30000);
  if (columns.length !== alternate.columns.length || columns.some((column, i) => column.amount !== alternate.columns[i].amount || column.unit !== alternate.columns[i].unit || column.prepared !== alternate.columns[i].prepared)) {
    return { ...result, columns: [], notice: 'Reference amounts disagree between readings. Try a closer photo or enter values manually.' };
  }
  result.columns.forEach((column, index) => nutrients.forEach(key => {
    const other = alternate.columns[index], a = column.nutrition[key], b = other.nutrition[key];
    const evidence = [column.evidence[key], other.evidence[key]].filter(Boolean).join(' | ').slice(0, 1000);
    const blocker = [column.issues[key], other.issues[key]].find(issue => issue && /bounded|ambiguous|conflicting/i.test(issue));
    if (blocker) { column.nutrition[key] = null; column.issues[key] = blocker; column.evidence[key] = evidence; if (column.suggestions) delete column.suggestions[key]; return; }
    if (a != null && b != null && !new D(a).eq(b)) {
      const left = column.evidence[key] ?? '', right = other.evidence[key] ?? '';
      const leftKJ = printedEnergy(left, 'kj'), rightKJ = printedEnergy(right, 'kj');
      const leftKcal = printedEnergy(left, 'kcal').length > 0, rightKcal = printedEnergy(right, 'kcal').length > 0;
      // Identical stated kJ plus an explicit kcal value are not two different
      // measurements. Preserve printed kcal, never compare it with an exact
      // conversion of the same rounded kJ. No tolerance or macro estimate.
      if (key === 'kcal' && leftKcal !== rightKcal && leftKJ.length && JSON.stringify(leftKJ) === JSON.stringify(rightKJ)) {
        if (rightKcal) { column.nutrition[key] = b; column.evidence[key] = right; }
        return;
      }
      column.nutrition[key] = null; column.issues[key] = 'Conflicting readings · enter the label value'; column.evidence[key] = evidence;
    }
    else if (a == null && b != null) { column.nutrition[key] = b; column.evidence[key] = other.evidence[key]; delete column.issues[key]; if (column.suggestions) delete column.suggestions[key]; }
  }));
  return labelCandidateSchema.parse(result);
}
export function upgradeLabelForm(form: LabelForm): LabelForm {
  const old = form.scan; if (!old || old.engine !== 'platform' || (old.parserVersion ?? 0) >= 2) return form;
  const next = parseNutritionLabel({ engine: 'platform', text: old.text, blocks: [] }, old.scannedAt);
  if (next.columns.length !== old.columns.length || next.columns.some((column, i) => column.amount !== old.columns[i].amount || column.unit !== old.columns[i].unit || column.prepared !== old.columns[i].prepared)) return { ...form, scan: { ...old, parserVersion: 2 } };
  const values = { ...form.values };
  next.columns.forEach((column, i) => nutrients.forEach(key => {
    const before = old.columns[i].nutrition[key];
    if (before != null) { column.nutrition[key] = before; delete column.issues[key]; }
    else if (form.column === i && !values[key] && column.nutrition[key] != null) values[key] = column.nutrition[key]!;
  }));
  return { ...form, values, scan: next };
}
export function applyLabelColumn(form: LabelForm, candidate: LabelCandidate, column: number): LabelForm {
  const selected = candidate.columns[column]; if (!selected) throw new Error('Choose a label column.');
  return { ...form, basis: selected.unit, amount: form.basis === selected.unit ? form.amount : '', values: Object.fromEntries(nutrients.map(key => [key, selected.nutrition[key] ?? ''])) as LabelForm['values'], scan: candidate, column };
}
export function reviewedLabelFood(form: LabelForm, existing?: Food): Food {
  const column = form.scan && form.column !== undefined ? form.scan.columns[form.column] : undefined;
  if (form.scan && !column) throw new Error('Choose a label column or enter the values manually.');
  const nutrition = Object.fromEntries(nutrients.map(key => {
    const input = form.values[key].trim(), original = column?.nutrition[key] ?? (form.basis === existing?.referenceUnit ? existing.nutrition[key] : undefined);
    const value = !input ? null : input === original && decimalSchema.safeParse(input).success ? input : parseAmount(input);
    if (input && value === null) throw new Error('Check the nutrition values. Leave unknown values blank.');
    return [key, value];
  })) as Food['nutrition'];
  if (form.scan && !nutrients.some(key => nutrition[key] !== null)) throw new Error('Enter at least one value from the label.');
  const at = new Date().toISOString();
  return validateFood({ ...(existing ?? {}), id: form.id, name: form.name, aliases: existing?.aliases ?? [], barcode: form.barcode.trim() || null, referenceUnit: form.basis, nutrition, gramsPerMeasure: existing?.gramsPerMeasure ?? {},
    provenance: { ...(existing?.provenance ?? { sourceID: form.id, retrievedAt: at }), source: existing?.provenance.source === 'openFoodFacts' ? 'openFoodFacts' : form.scan || existing?.provenance.source === 'confirmedOCR' ? 'confirmedOCR' : 'manual',
      ...(existing?.provenance.source === 'openFoodFacts' ? { labelReview: { ...(existing.provenance.labelReview ?? { originalName: existing.name, originalNutrition: existing.nutrition, originalReferenceUnit: existing.referenceUnit, nutritionSource: 'Saved product record' }), confirmedAt: at } } : {}),
      nutrientSources: Object.fromEntries(nutrients.map(key => [key, nutrition[key] === null ? 'Unknown' : existing && form.basis === existing.referenceUnit && nutrition[key] === existing.nutrition[key] ? existing.provenance.nutrientSources[key] ?? 'Saved label value' : column && nutrition[key] === column.nutrition[key] ? `Label OCR · reviewed · ${column.title}` : 'User-confirmed label value'])),
      ...(form.scan && column ? { labelScan: { engine: form.scan.engine, scannedAt: form.scan.scannedAt, confirmedAt: at, basis: column.title, originalNutrition: column.nutrition } } : {}) } });
}

import { Food, LogEntry } from './model';
import { cookingRecordAllowed, ingredientAliases, ingredientRelevance, vocabulary } from './foodLanguage';

export function normalize(text: string): string {
  return text.toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'o').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function near(a: string, b: string): boolean {
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + a.length - i + b.length - j <= 1;
}
type Indexed = { food: Food; names: string[]; words: string[]; compact: string[] };
export class FoodIndex {
  private records = new Map<string, Indexed>();
  private prefixes = new Map<string, Set<string>>();
  private cache = new Map<string, Food[]>();
  private saved = new Set<string>();
  private favorites = new Set<string>();
  private confirmed: Record<string, { foodId: string }> = {};
  private usage = new Map<string, { count: number; latest: number }>();
  add(food: Food) {
    const old = this.records.get(food.id);
    if (old) for (const word of old.words) for (let n = 1; n <= word.length; n++) this.prefixes.get(word.slice(0, n))?.delete(food.id);
    const sourceNames = [food.name, ...food.aliases, food.barcode ?? ''].map(normalize).filter(Boolean);
    const names = [...new Set([...sourceNames, ...ingredientAliases(sourceNames)])];
    const words = vocabulary([...new Set(names.flatMap(n => n.split(' ')))]);
    this.records.set(food.id, { food, names, words, compact: names.map(n => n.replaceAll(' ', '')) });
    for (const word of words) for (let n = 1; n <= word.length; n++) {
      const prefix = word.slice(0, n);
      if (!this.prefixes.has(prefix)) this.prefixes.set(prefix, new Set());
      this.prefixes.get(prefix)!.add(food.id);
    }
    this.cache.clear();
  }
  get(id: string) { return this.records.get(id)?.food; }
  get size() { return this.records.size; }
  exact(input: string) {
    const query = normalize(input), tokens = query.split(' ').sort().join(' ');
    return query ? [...this.records.values()].filter(record => record.names.some(name => name === query || name.split(' ').sort().join(' ') === tokens)).map(record => record.food) : [];
  }
  setPersonal(saved: Food[], logs: LogEntry[], favorites: string[] = [], confirmed: Record<string, { foodId: string }> = {}) {
    this.confirmed = confirmed;
    this.favorites = new Set(favorites);
    this.saved = new Set(saved.map(f => f.id));
    saved.forEach(f => this.add(f));
    this.usage.clear();
    for (const log of logs) {
      if (log.snapshot.kind !== 'food') continue;
      const id = log.snapshot.ingredient.food.id, previous = this.usage.get(id);
      this.usage.set(id, { count: (previous?.count ?? 0) + 1, latest: Math.max(previous?.latest ?? 0, Date.parse(log.recordedAt)) });
    }
    this.cache.clear();
  }
  isSaved(id: string) { return this.saved.has(id); }
  search(input: string, savedOnly = false): Food[] {
    const query = normalize(input.slice(0, 200)), key = `${savedOnly}:${query}`;
    const cached = this.cache.get(key); if (cached) return cached;
    const terms = query.split(' ').filter(Boolean).slice(0, 12);
    let ids: string[];
    if (!terms.length) ids = [...this.records.keys()];
    else {
      const sets = terms.map(t => this.prefixes.get(t) ?? new Set<string>()).sort((a, b) => a.size - b.size);
      ids = [...sets[0]].filter(id => sets.every(set => set.has(id)));
      if (!ids.length) ids = [...this.records.values()].filter(r => terms.every(term => r.words.some(word => word.startsWith(term) || near(term, word) || ['en', 'er', 'ene'].some(suffix => term === word + suffix)) || (term.length >= 6 && r.compact.some(c => c.includes(term))))).map(r => r.food.id);
    }
    const relevant = ids.filter(id => (!savedOnly || this.saved.has(id)) && (!query || cookingRecordAllowed(query, this.records.get(id)!.food)));
    const tier = (id: string) => {
      const exact = this.records.get(id)!.names.includes(query) && query !== '';
      return (this.confirmed[query]?.foodId === id ? 10000 : 0) + (exact ? 5000 : 0) + (this.favorites.has(id) ? 3000 : 0) + (this.usage.has(id) ? 2000 : 0) + (this.saved.has(id) ? 1000 : 0) + ingredientRelevance(query, this.records.get(id)!.names);
    };
    relevant.sort((a, b) => tier(b) - tier(a) || (this.usage.get(b)?.count ?? 0) - (this.usage.get(a)?.count ?? 0) || (this.usage.get(b)?.latest ?? 0) - (this.usage.get(a)?.latest ?? 0) || this.records.get(a)!.food.name.length - this.records.get(b)!.food.name.length || this.records.get(a)!.food.name.localeCompare(this.records.get(b)!.food.name, 'nb'));
    const result = relevant.slice(0, 50).map(id => this.records.get(id)!.food);
    if (this.cache.size >= 100) this.cache.clear();
    this.cache.set(key, result);
    return result;
  }
}

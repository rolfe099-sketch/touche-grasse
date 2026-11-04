import catalog from '../src/data/catalog.json';
import { Food, Recipe } from '../src/domain/model';

// Explicit test selections, never seeded as the owner's actual recipe.
// Stock and seasonings have no supplied quantities: this is ONLY the seven-ingredient subtotal.
export const pestoSelections = [
  ['mvt:03.205', '1200', 'kylling filet'],
  ['mvt:05.016', '400', 'pasta naturell'],
  ['mvt:06.144', '140', 'pesto grønn kjøpt'],
  ['mvt:01.089', '200', 'crème fraîche'],
  ['mvt:06.103', '100', 'tomater soltørkede i olje'],
  ['mvt:01.297', '125', 'mozzarella lake'],
  ['mvt:01.200', '40', 'parmesan'],
] as const;
export function pestoSubtotal(): Recipe {
  return { id: 'test:pesto-subtotal', name: 'Kremet pesto-pasta · uten kraft og krydder', servings: '6', cookedWeightGrams: null, favorite: false,
    ingredients: pestoSelections.map(([id, quantity], i) => ({ id: `ingredient:${i}`, food: catalog.find(f => f.id === id)! as Food, quantity, unit: 'g' })),
    steps: ['Test av de sju målte ingrediensene. Kraft og krydder må avklares før dette er en komplett oppskrift.'] };
}

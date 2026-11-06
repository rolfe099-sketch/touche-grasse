// Minimal API v3.6 packaging record. The milk fields match the official staging
// response checked on 2026-11-04; no images or personal history are included.
export const milkCode = '7038010001918';
export const milkProduct = () => ({ code: milkCode, status: 'success', result: { id: 'product_found' }, product: {
  code: milkCode, product_name_nb: 'Lettmelk 0,5% fett', product_name_en: 'Low fat milk', brands: 'TINE', quantity: '1000 ml',
  nutrition: { input_sets: [{ source: 'packaging', preparation: 'as_sold', per: '100ml', per_quantity: 100, per_unit: 'ml',
    nutrients: { 'energy-kcal': { value: 37, unit: 'kcal' }, proteins: { value: 3.6, unit: 'g' }, carbohydrates: { value: 4.7, unit: 'g' }, fat: { value: 0.5, unit: 'g' } } }] },
} });

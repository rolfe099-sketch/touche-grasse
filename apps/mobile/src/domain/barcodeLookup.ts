import { BarcodeCandidate, barcodeKey, parseBarcodeProduct, validRemoteBarcode } from './barcode';
import { structuredCopy } from './model';

export const barcodeApi = 'https://world.openfoodfacts.org/api/v3.6/product/';
export const barcodeFields = 'code,product_name,product_name_nb,product_name_en,brands,quantity,nutrition,last_modified_t';
export type BarcodeLookupResult = { kind: 'found'; candidate: BarcodeCandidate } | { kind: 'missing' };
export type BarcodeFetch = (url: string, init?: RequestInit) => Promise<Response>;
type Options = { fetch?: BarcodeFetch; now?: () => number; native?: boolean; endpoint?: string; headers?: Record<string, string>; timeoutMs?: number; isOnline?: () => boolean };
const connectionMessage = 'Could not connect. Saved products work offline; new products need a connection or manual label values.';
export function createBarcodeLookup(options: Options = {}) {
  const request = options.fetch ?? globalThis.fetch.bind(globalThis), now = options.now ?? Date.now;
  const cache = new Map<string, { until: number; result: BarcodeLookupResult }>();
  let calls: { at: number }[] = [], blockedUntil = 0;
  return async (value: string, signal?: AbortSignal): Promise<BarcodeLookupResult> => {
    if (!validRemoteBarcode(value)) throw new Error('Check the barcode digits and check digit, or enter the label manually.');
    if (signal?.aborted) throw new Error('Lookup cancelled.');
    const key = barcodeKey(value), existing = cache.get(key);
    if (existing && existing.until > now()) return structuredCopy(existing.result);
    if (options.isOnline?.() === false) throw new Error(connectionMessage);
    calls = calls.filter(call => call.at > now() - 60000);
    if (blockedUntil > now() || calls.length >= 12) throw new Error('Product lookup is busy. Wait a minute or enter the label manually.');
    const attempt = { at: now() }; calls.push(attempt);
    let receivedResponse = false;
    const controller = new AbortController(); let timedOut = false;
    const cancel = () => controller.abort(); signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 10000);
    try {
      const url = `${options.endpoint ?? barcodeApi}${key}?fields=${barcodeFields}&app_name=ToucheGrasse&app_version=0.1&app_platform=${options.native ? 'native' : 'web'}`;
      const response = await request(url, { signal: controller.signal, credentials: 'omit', headers: { Accept: 'application/json', ...(options.native ? { 'User-Agent': 'ToucheGrasse/0.1 (https://github.com/rolfe099-sketch/touche-grasse)' } : {}), ...options.headers } });
      receivedResponse = true;
      if (response.status === 429) { blockedUntil = now() + 60000; throw new Error('Product lookup is busy. Wait a minute or enter the label manually.'); }
      if (response.status !== 404 && !response.ok) throw new Error('The product service is unavailable. Try again or enter the label manually.');
      if (Number(response.headers.get('content-length') ?? 0) > 1000000) throw new Error('The product response is too large. Enter the label manually.');
      const raw = await response.text(); if (raw.length > 1000000) throw new Error('The product response is too large. Enter the label manually.');
      if (controller.signal.aborted) throw new Error('Lookup cancelled.');
      let payload: unknown; try { payload = JSON.parse(raw); } catch { throw new Error('The product service returned an unreadable record. Enter the label manually.'); }
      const candidate = parseBarcodeProduct(payload, key, new Date(now()));
      if (response.status === 404 && candidate) throw new Error('The product service returned an unreadable record.');
      const result: BarcodeLookupResult = candidate ? { kind: 'found', candidate } : { kind: 'missing' };
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(key, { until: now() + (candidate ? 15 * 60000 : 60000), result });
      return structuredCopy(result);
    } catch (error) {
      if (timedOut) throw new Error('Product lookup timed out. Try again or enter the label manually.');
      if (signal?.aborted) throw new Error('Lookup cancelled.');
      if (error instanceof TypeError) {
        // A failed connection must not impose a local one-minute lockout when
        // connectivity returns. HTTP responses still count, including 429/5xx.
        if (!receivedResponse) calls = calls.filter(call => call !== attempt);
        throw new Error(connectionMessage);
      }
      throw error;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
  };
}

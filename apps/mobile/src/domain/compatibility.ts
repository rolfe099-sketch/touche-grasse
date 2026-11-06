// Zod deliberately strips unrecognized object fields. At a persistence boundary
// that would silently lose data from a newer app, so detect it before any write.
export function assertSupportedFields(source: unknown, parsed: unknown, context: 'backup' | 'diary') {
  if (!source || typeof source !== 'object') return;
  if (!parsed || typeof parsed !== 'object') throw new Error(`This ${context} has unsupported fields. A newer app may be required. No records were changed.`);
  for (const key of Object.keys(source)) {
    if (!Object.prototype.hasOwnProperty.call(parsed, key)) throw new Error(`This ${context} has unsupported fields. A newer app may be required. No records were changed.`);
    assertSupportedFields((source as Record<string, unknown>)[key], (parsed as Record<string, unknown>)[key], context);
  }
}

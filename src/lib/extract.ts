import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from './supabase';

export type ExtractInput =
  | { type: 'image'; media_type: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }
  | { type: 'pdf'; data: string }
  | { type: 'text'; text: string };

/**
 * Sends an order (base64 image/PDF, or text) to the extract-spend edge function.
 * Returns the raw `extraction` value, unvalidated: feed it to normalizeExtraction().
 * Throws Error with a user-readable message on failure.
 */
export async function extractSpend(input: ExtractInput): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('extract-spend', { body: { input } });
  if (error) {
    // Non-2xx: our { error } body lives on the Response in error.context.
    const body = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    throw new Error(body?.error ?? error.message);
  }
  return data?.extraction;
}

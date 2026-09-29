/**
 * Compares two secrets without returning at the first difference, so the comparison does not
 * reveal how much of the expected value was guessed.
 *
 * Mismatched lengths return early. That is unavoidable, and it leaks only the length, which
 * a caller cannot use to walk toward the value.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left[i] ^ right[i];
  }
  return diff === 0;
}

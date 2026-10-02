/** UUIDv7 from 16 random bytes and a millisecond clock (RFC 9562): time-ordered, client-generated. */
export function uuidv7(random: Uint8Array, ms: number = Date.now()): string {
  const b = Uint8Array.from(random.subarray(0, 16));
  for (let i = 0; i < 6; i++) b[i] = Math.floor(ms / 2 ** (8 * (5 - i))) & 0xff;
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

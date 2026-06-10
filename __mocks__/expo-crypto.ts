// Deterministic "randomness" is fine for unit tests — the adapter only needs
// bytes it can store and reuse for decryption.
let counter = 0;
export const getRandomValues = jest.fn(<T extends Uint8Array>(array: T): T => {
  counter += 1;
  for (let i = 0; i < array.length; i++) array[i] = (i * 7 + counter * 13) % 256;
  return array;
});

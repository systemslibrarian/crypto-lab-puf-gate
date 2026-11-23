/** Random bytes for challenges: crypto.getRandomValues. Tests inject a seeded source instead. */
export const cryptoBytes = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));

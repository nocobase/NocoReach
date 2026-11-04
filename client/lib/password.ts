/** Better Auth's default `minPasswordLength`; the server checks the configured length again. */
export const MIN_PASSWORD_LENGTH = 8;

// Letters and digits that cannot be mistaken for one another when read aloud or copied by hand.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** A password an administrator passes on to a member: three groups of four, about 69 bits. */
export function randomPassword(): string {
  const values = crypto.getRandomValues(new Uint32Array(12));
  const characters = Array.from(
    values,
    (value) => ALPHABET[value % ALPHABET.length],
  );
  return [0, 4, 8]
    .map((start) => characters.slice(start, start + 4).join(''))
    .join('-');
}

import { createHash, randomBytes } from 'crypto';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/** Okunabilir geçici şifre (karışabilecek karakterler hariç). */
export function temporaryPassword(length = 10): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export const normalizeUsername = (username: string) => username.trim().toLocaleLowerCase('en-US');
export const normalizeTenantCode = (code: string) => code.trim().toLocaleUpperCase('en-US');

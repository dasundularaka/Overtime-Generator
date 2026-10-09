/**
 * Utility helpers for PF (Provident Fund) Numbers.
 * Standard format: "PF" followed by 6 digits, e.g. "PF123456".
 */

export function formatPfNumber(input: string): string {
  if (!input) return '';
  const clean = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (clean.startsWith('PF')) {
    const digits = clean.slice(2).replace(/\D/g, '');
    if (!digits) return clean;
    return 'PF' + digits.padStart(6, '0').slice(-6);
  }

  // Purely digits provided, e.g. "123456"
  const digits = clean.replace(/\D/g, '');
  if (digits) {
    return 'PF' + digits.padStart(6, '0').slice(-6);
  }

  return clean;
}

export function isValidPfNumber(input: string): boolean {
  if (!input) return false;
  const formatted = formatPfNumber(input);
  return /^PF\d{6}$/.test(formatted);
}

export function generateStandardPfNumber(): string {
  const digits = Math.floor(100000 + Math.random() * 900000).toString();
  return `PF${digits}`;
}

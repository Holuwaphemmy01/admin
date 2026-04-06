export function normalizeCredentialValue(value: string): string {
  return value.trim();
}

export function normalizeCaseInsensitiveValue(value: string): string {
  return normalizeCredentialValue(value).toLowerCase();
}

export function normalizePhoneNumber(value: string): string {
  const trimmedValue = normalizeCredentialValue(value);
  const firstDigitIndex = trimmedValue.search(/\d/);
  const firstPlusIndex = trimmedValue.indexOf("+");
  const hasLeadingPlus =
    firstPlusIndex !== -1 && (firstDigitIndex === -1 || firstPlusIndex < firstDigitIndex);
  const digitsOnly = trimmedValue.replace(/\D/g, "");

  if (!digitsOnly) {
    return "";
  }

  return hasLeadingPlus ? `+${digitsOnly}` : digitsOnly;
}

export function isPhoneLike(value: string): boolean {
  const normalizedValue = normalizeCredentialValue(value);
  const digitsOnly = normalizedValue.replace(/\D/g, "");

  return /^[+()\d\s-]+$/.test(normalizedValue) && digitsOnly.length >= 6;
}

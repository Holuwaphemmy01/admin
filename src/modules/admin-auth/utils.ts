import { ADMIN_ROLES, AdminRole } from "./types";

export function normalizeCredentialValue(value: string): string {
  return value.trim();
}

export function normalizeCaseInsensitiveValue(value: string): string {
  return normalizeCredentialValue(value).toLowerCase();
}

export function normalizeEmailAddress(value: string): string {
  return normalizeCaseInsensitiveValue(value);
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

export function isValidEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmailAddress(value));
}

export function isAdminRole(value: string): value is AdminRole {
  return ADMIN_ROLES.includes(value as AdminRole);
}

export function formatAdminRole(role: AdminRole): string {
  return role
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

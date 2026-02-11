/**
 * Phone number utilities:
 * - isValidE164: check phone is in E.164 format (+XX…)
 * - formatPhoneDisplay: E.164 → human-readable segmented format
 */

/** Returns true if phone is in E.164 format (+XX followed by digits). */
export function isValidE164(phone: string): boolean {
  if (!phone) return true; // empty = optional field
  return /^\+\d{7,15}$/.test(phone);
}

/**
 * Format an E.164 phone number for display with grouped digits.
 *
 * +33674911383  → +33 6 74 91 13 83
 * +14155551234  → +1 415 555 1234
 * +442071234567 → +44 20 7123 4567
 *
 * Falls back to raw number if not E.164.
 */
export function formatPhoneDisplay(phone: string): string {
  if (!phone) return "";
  if (!phone.startsWith("+")) return phone;

  // France: +33 X XX XX XX XX
  if (phone.startsWith("+33") && phone.length === 12) {
    const n = phone.slice(3);
    return `+33 ${n[0]} ${n.slice(1, 3)} ${n.slice(3, 5)} ${n.slice(5, 7)} ${n.slice(7, 9)}`;
  }

  // US/Canada: +1 XXX XXX XXXX
  if (phone.startsWith("+1") && phone.length === 12) {
    const n = phone.slice(2);
    return `+1 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }

  // UK: +44 XX XXXX XXXX
  if (phone.startsWith("+44") && phone.length >= 12) {
    const n = phone.slice(3);
    return `+44 ${n.slice(0, 2)} ${n.slice(2, 6)} ${n.slice(6)}`;
  }

  // Generic: +CC then pairs of digits
  // Find country code length (1, 2, or 3 digits)
  const digits = phone.slice(1);
  let ccLen = 2; // default
  if (digits.startsWith("1") || digits.startsWith("7")) ccLen = 1;
  else if (digits.length > 10) ccLen = 3;

  const cc = digits.slice(0, ccLen);
  const rest = digits.slice(ccLen);
  const pairs = rest.match(/.{1,2}/g) || [];
  return `+${cc} ${pairs.join(" ")}`;
}

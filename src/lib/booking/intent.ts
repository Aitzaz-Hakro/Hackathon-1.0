/**
 * URL-safe handoff payload between the AI assistant and the booking wizard.
 * Encoded as base64url JSON in the `intent` searchParam. Both sides treat it
 * as untrusted input: decoding only shape-checks the envelope, and the wizard
 * validates every field against its own loaded options before using it.
 */

export type BookingIntent = {
  lab?: string | null;
  equipment?: { id: string; quantity: number }[] | null;
  date?: string | null;
  start?: string | null;
  end?: string | null;
  purpose?: string | null;
  attendees?: number | null;
};

export function encodeBookingIntent(intent: BookingIntent): string {
  const bytes = new TextEncoder().encode(JSON.stringify(intent));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeBookingIntent(value: string | null | undefined): BookingIntent | null {
  if (!value || value.length > 2000 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as BookingIntent;
  } catch {
    return null;
  }
}

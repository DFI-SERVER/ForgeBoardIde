/**
 * Error helpers shared by every feature.
 */
/** Pull a readable message out of a thrown value (incl. serialized ProjectError). */
export function errText(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}

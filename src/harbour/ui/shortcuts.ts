export const SHORTCUTS_KEY = "harbour.character-shortcuts.v1";
export function readShortcuts(): boolean {
  try { return localStorage.getItem(SHORTCUTS_KEY) !== "false"; } catch { return true; }
}
export function saveShortcuts(enabled: boolean): void {
  try { localStorage.setItem(SHORTCUTS_KEY, String(enabled)); } catch { /* usable for this visit */ }
}

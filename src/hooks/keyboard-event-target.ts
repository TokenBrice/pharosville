/**
 * The world's keyboard shortcuts live on the shell element, and the legend,
 * changelog and harbor-ledger panels render inside that subtree — so their keys
 * bubble into the shell handlers. A key pressed inside an open dialog belongs to
 * that dialog: Escape closes it (and must not also drop the selection behind
 * it), Tab moves within its focus trap (and must not be eaten by the map-target
 * cycle), arrows scroll its body (and must not pan the camera).
 */
export function isDialogEventTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && Boolean(target.closest("[role='dialog'], [role='alertdialog']"));
}

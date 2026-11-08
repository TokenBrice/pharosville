import { mountOverlayHarness } from "./overlay";
void mountOverlayHarness(document.getElementById("overlay")!).then((harness) => {
  (window as unknown as { __overlay: typeof harness }).__overlay = harness;
});

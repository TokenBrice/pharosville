import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { PharosVilleClient } from "./client";

export function App() {
  return (
    <main data-pharosville-route tabIndex={-1}>
      <h1 id="pharosville-heading" className="sr-only">PharosVille</h1>
      <SectionErrorBoundary name="PharosVille" supportingText="Refresh the page to retry the PharosVille harbour.">
        <PharosVilleClient />
      </SectionErrorBoundary>
    </main>
  );
}

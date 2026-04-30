import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { PharosVilleClient } from "./client";

export function App() {
  return (
    <div data-pharosville-route>
      <h1 id="pharosville-heading" className="sr-only">PharosVille</h1>
      <SectionErrorBoundary name="PharosVille" supportingText="Refresh the page to retry the PharosVille map.">
        <PharosVilleClient />
      </SectionErrorBoundary>
    </div>
  );
}

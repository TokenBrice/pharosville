import { reportClientError } from "../error-reporter";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface SectionErrorBoundaryProps {
  children: ReactNode;
  name: string;
  supportingText: string;
}

interface SectionErrorBoundaryState {
  error: Error | null;
}

export class SectionErrorBoundary extends Component<SectionErrorBoundaryProps, SectionErrorBoundaryState> {
  state: SectionErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): SectionErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError("render", { kind: "component-failure", section: this.props.name, message: error.message }, `${this.props.name}:${error.message}`);
    console.error(`[${this.props.name}] render failed`, error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <section className="pharosville-narrow" aria-labelledby="pharosville-error-title">
        <div className="pharosville-narrow__inner">
          <div className="pharosville-narrow__beacon" aria-hidden="true" />
          <p className="pharosville-narrow__kicker">{this.props.name}</p>
          <h2 id="pharosville-error-title">The harbor did not render.</h2>
          <p>{this.props.supportingText}</p>
          <button type="button" onClick={() => window.location.reload()}>Reload harbor</button>
        </div>
      </section>
    );
  }
}

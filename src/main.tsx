import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installClientErrorReporter } from "./error-reporter";
import { installGoogleAnalytics } from "./google-analytics";

installClientErrorReporter();
installGoogleAnalytics();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

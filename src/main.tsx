import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/base.css";
import "./styles/dark-shell.css";
import "./styles/marketing.css";
import "./styles/marketing-dashboard.css";
import "./styles/scan.css";
import "./styles/report.css";
import "./styles/report-lists.css";
import "./styles/report-actions.css";
import "./styles/extraction-map.css";
import "./styles/extraction-map-drawer.css";
import "./styles/responsive.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

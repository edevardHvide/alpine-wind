import { createRoot } from "react-dom/client";
import "./index.css";

const path = window.location.pathname.replace(/\/$/, '');
if (path === '/monitor') {
  import('./components/MonitorDashboard').then(({ default: Monitor }) => {
    createRoot(document.getElementById("root")!).render(<Monitor />);
  });
} else {
  // Chain imports: error reporter must init before app renders
  import('./utils/error-reporter').then(({ initErrorReporter }) => {
    initErrorReporter();
    return import('./App');
  }).then(({ default: App }) => {
    // No StrictMode — Cesium's Viewer does direct DOM manipulation
    // that conflicts with React's double-mount in development
    createRoot(document.getElementById("root")!).render(<App />);
  });
}

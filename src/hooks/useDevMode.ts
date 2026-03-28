import { useState, useEffect } from "react";

export function useDevMode() {
  const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const enabled = isLocalhost && new URLSearchParams(window.location.search).has("dev");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        setVisible((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled]);

  return { devEnabled: enabled, devVisible: visible, setDevVisible: setVisible };
}

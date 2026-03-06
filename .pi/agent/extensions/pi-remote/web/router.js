// Minimal hash-based router. Drives browser back/forward buttons.
//
// Routes:
//   #/           → session list
//   #/session/HOST/SESSION_ID → session view (WS proxied through hub)

import { useState, useEffect, useCallback } from "./vendor.js";

const parseHash = () => {
  const hash = window.location.hash.slice(1) || "/";
  const sessionMatch = hash.match(/^\/session\/(.+)\/(.+)$/);
  if (sessionMatch) {
    return { view: "session", host: sessionMatch[1], port: sessionMatch[2] };
  }
  return { view: "list" };
};

export const useRouter = () => {
  const [route, setRoute] = useState(parseHash);

  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigateToSession = useCallback((session) => {
    window.location.hash = `/session/${session.hubHost}/${session.id}`;
  }, []);

  const navigateToList = useCallback(() => {
    window.location.hash = "/";
  }, []);

  return { route, navigateToSession, navigateToList };
};

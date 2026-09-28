import { useEffect, useState } from "react";

/** Marca de tiempo (ms) que se refresca cada `everyMs`; sirve para cronómetros y cuentas atrás. */
export function useNow(everyMs = 500, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs, enabled]);
  return now;
}

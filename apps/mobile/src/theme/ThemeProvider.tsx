import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { type ColorSchemeName, StyleSheet, useColorScheme, useWindowDimensions } from "react-native";
import { dark, light, MEDIUM, type Palette, WIDE } from "./tokens";

export type ThemePref = "dark" | "light" | "system";
const KEY = "cf_theme";

interface ThemeCtx {
  c: Palette;
  scheme: "dark" | "light";
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

function resolve(pref: ThemePref, system: ColorSchemeName): "dark" | "light" {
  if (pref === "system") return system === "light" ? "light" : "dark";
  return pref;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>("dark");

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === "dark" || v === "light" || v === "system") setPrefState(v);
      })
      .catch(() => {});
  }, []);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    AsyncStorage.setItem(KEY, p).catch(() => {});
  }, []);

  const scheme = resolve(pref, system);
  const value = useMemo<ThemeCtx>(
    () => ({ c: scheme === "dark" ? dark : light, scheme, pref, setPref }),
    [scheme, pref, setPref],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme fuera de ThemeProvider");
  return v;
}

/** Crea estilos dependientes del tema y los memoiza. */
export function useStyles<T extends StyleSheet.NamedStyles<T>>(make: (c: Palette) => T): T {
  const { c } = useTheme();
  // biome-ignore lint: `make` es estable por módulo
  return useMemo(() => StyleSheet.create(make(c)), [c]);
}

export type Breakpoint = "compact" | "medium" | "wide";

export function useBreakpoint(): { bp: Breakpoint; width: number; isWide: boolean } {
  const { width } = useWindowDimensions();
  const bp: Breakpoint = width >= WIDE ? "wide" : width >= MEDIUM ? "medium" : "compact";
  return { bp, width, isWide: bp === "wide" };
}

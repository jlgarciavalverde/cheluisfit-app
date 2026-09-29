import { router, useFocusEffect, usePathname } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, ScrollView, View } from "react-native";
import { type Edge, SafeAreaView } from "react-native-safe-area-context";
import { useActiveWorkout } from "@/data/activeWorkoutStore";
import { useAuth } from "@/data/authStore";
import { useBreakpoint, useTheme } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";
import { AI_BUBBLE_PAD, isLiveWorkoutPath, showsWorkoutBar, TAB_BAR_HEIGHT, useBottomChrome, WORKOUT_BAR_PAD } from "./bottomChrome";
import { IconButton } from "./ui/Button";
import { Text } from "./ui/Text";

/**
 * - `tab`: pantallas de las pestañas (sin borde inferior: lo pone la barra de pestañas).
 * - `detail`: pantallas que se abren desde otra (con botón atrás).
 * - `form`: formularios (más estrechos en escritorio).
 */
export type ScreenVariant = "tab" | "detail" | "form";

export function Screen({
  children,
  variant = "detail",
  scroll = true,
  edges,
  maxWidth,
  footer,
  testID,
  contentPadding = true,
  reportChrome = true,
}: {
  children: React.ReactNode;
  variant?: ScreenVariant;
  scroll?: boolean;
  edges?: Edge[];
  /** Solo para casos especiales: por defecto lo decide `variant`. */
  maxWidth?: number;
  /** Zona fija inferior (botón principal). */
  footer?: React.ReactNode;
  testID?: string;
  contentPadding?: boolean;
  /** `false` fuera del navegador (la pantalla de error de la raíz): no hay foco que seguir. */
  reportChrome?: boolean;
}) {
  const { c } = useTheme();
  const { bp } = useBreakpoint();
  const resolvedEdges: Edge[] = edges ?? (variant === "tab" ? ["top"] : ["top", "bottom"]);
  const width = maxWidth ?? (variant === "tab" ? (bp === "wide" ? 1180 : 760) : variant === "form" ? 620 : bp === "wide" ? 900 : 760);
  const pathname = usePathname();
  const [footerH, setFooterH] = useState(0);
  // Lo fijo abajo en esta pantalla: la barra de pestañas o el pie (ver `bottomChrome.ts`).
  const chrome = variant === "tab" ? TAB_BAR_HEIGHT : footer ? footerH : 0;
  // Lo que flota encima tapa el final del contenido: se deja hueco para cada capa.
  const hasBar = useActiveWorkout((s) => !!s.workout) && showsWorkoutBar(pathname);
  const hasAiBubble = useAuth((s) => !!s.token) && scroll && bp !== "wide" && !isLiveWorkoutPath(pathname);
  const pad = contentPadding ? (bp === "compact" ? space.lg : space.xl) : 0;
  const inner = (
    <View
      style={{
        width: "100%",
        maxWidth: width,
        alignSelf: "center",
        paddingHorizontal: pad,
        paddingBottom: space.xl + (hasBar ? WORKOUT_BAR_PAD : 0) + (hasAiBubble ? AI_BUBBLE_PAD : 0),
        // Con `scroll={false}` este contenedor necesita altura acotada (heredada del `flex:1`
        // de más arriba) para que un `FlatList` dentro pueda virtualizar de verdad.
        ...(scroll ? null : { flex: 1 }),
      }}
    >
      {children}
    </View>
  );
  return (
    <SafeAreaView testID={testID} edges={resolvedEdges} style={{ flex: 1, backgroundColor: c.bg }}>
      {reportChrome ? <ReportChrome height={chrome} /> : null}
      {/* Android moderno dibuja de borde a borde y ya no redimensiona con el teclado. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {scroll ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {inner}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>{inner}</View>
        )}
        {footer ? (
          <View
            onLayout={(e) => setFooterH(Math.round(e.nativeEvent.layout.height))}
            style={{
              borderTopWidth: 1,
              borderTopColor: c.border,
              backgroundColor: c.bg,
              paddingHorizontal: pad,
              paddingVertical: space.md,
              alignItems: "center",
            }}
          >
            <View style={{ width: "100%", maxWidth: width }}>{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Publica el alto de lo fijo abajo cada vez que la pantalla gana el foco (o cambia estando enfocada). */
function ReportChrome({ height }: { height: number }) {
  const setHeight = useBottomChrome((s) => s.setHeight);
  useFocusEffect(useCallback(() => setHeight(height), [height, setHeight]));
  return null;
}

/** Cabecera de pantalla: título grande, subtítulo, atrás (o cerrar en modales) y acciones. */
export function ScreenHeader({
  title,
  subtitle,
  back,
  onBack,
  backIcon = "chevron-back",
  right,
}: {
  title: string;
  subtitle?: string;
  /** Muestra el botón de atrás (vuelve a la pantalla anterior). */
  back?: boolean;
  /** Sustituye la acción de atrás (los modales lo usan para cerrarse). */
  onBack?: () => void;
  backIcon?: "chevron-back" | "close";
  right?: React.ReactNode;
}) {
  const hasBack = back || !!onBack;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 64, paddingTop: space.sm }}>
      {hasBack ? (
        <View style={{ marginLeft: -space.md }}>
          <IconButton
            icon={backIcon}
            label={backIcon === "close" ? "Cerrar" : "Volver"}
            onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")))}
          />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text variant="title" numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

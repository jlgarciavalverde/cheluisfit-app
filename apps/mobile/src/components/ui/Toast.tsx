import { useEffect } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { create } from "zustand";
import { useTheme } from "@/theme/ThemeProvider";
import { elevation, radius, space } from "@/theme/tokens";
import { Text } from "./Text";

interface ToastState {
  id: number;
  message: string | null;
  actionLabel?: string;
  onAction?: () => void;
  show: (message: string, opts?: { actionLabel?: string; onAction?: () => void }) => void;
  hide: () => void;
}

export const useToast = create<ToastState>((set) => ({
  id: 0,
  message: null,
  show: (message, opts) =>
    set((s) => ({ id: s.id + 1, message, actionLabel: opts?.actionLabel, onAction: opts?.onAction })),
  hide: () => set({ message: null, actionLabel: undefined, onAction: undefined }),
}));

export const toast = (message: string, opts?: { actionLabel?: string; onAction?: () => void }) =>
  useToast.getState().show(message, opts);

/** Aviso inferior con acción opcional («Deshacer»). Se monta una sola vez en el layout raíz. */
export function ToastHost({ bottomOffset = 0 }: { bottomOffset?: number }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { id, message, actionLabel, onAction, hide } = useToast();

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(hide, actionLabel ? 6000 : 3200);
    return () => clearTimeout(t);
  }, [id, message, actionLabel, hide]);

  if (!message) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: insets.bottom + space.lg + bottomOffset,
        alignItems: "center",
        paddingHorizontal: space.lg,
      }}
    >
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.lg,
          maxWidth: 520,
          width: "100%",
          backgroundColor: c.text,
          borderRadius: radius.md,
          paddingLeft: space.lg,
          paddingRight: space.sm,
          paddingVertical: space.sm,
          minHeight: 52,
          ...elevation.toast,
        }}
      >
        <Text variant="body" color="bg" style={{ flex: 1 }}>
          {message}
        </Text>
        {actionLabel ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onAction?.();
              hide();
            }}
            style={{ minHeight: 44, paddingHorizontal: space.md, justifyContent: "center" }}
          >
            <Text variant="bodyStrong" style={{ color: c.brand }}>
              {actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

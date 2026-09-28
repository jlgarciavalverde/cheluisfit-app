import { ScrollView, View } from "react-native";
import { useBreakpoint } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

/**
 * Fila de chips (filtros). En móvil se desplaza en horizontal (ocupa una línea en vez de varias);
 * en escritorio se ajusta a varias líneas.
 */
export function ChipRow({ children, wrap }: { children: React.ReactNode; wrap?: boolean }) {
  const { isWide } = useBreakpoint();
  if (wrap ?? isWide) {
    return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>{children}</View>;
  }
  return (
    <ScrollView
      horizontal
      style={{ flexGrow: 0 }}
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ flexDirection: "row", gap: space.sm, paddingRight: space.lg }}
    >
      {children}
    </ScrollView>
  );
}

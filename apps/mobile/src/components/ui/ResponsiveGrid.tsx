import { Children } from "react";
import { View } from "react-native";
import { useBreakpoint } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

/** Una columna en móvil y dos a partir de tablet/escritorio. */
export function ResponsiveGrid({ children, gap = space.md }: { children: React.ReactNode; gap?: number }) {
  const { bp } = useBreakpoint();
  const two = bp !== "compact";
  const items = Children.toArray(children);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: gap }}>
      {items.map((child, i) => (
        <View key={i} style={{ width: two ? "49%" : "100%" }}>
          {child}
        </View>
      ))}
    </View>
  );
}

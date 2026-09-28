import { Modal, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";
import { ScreenHeader } from "./Screen";

/** Modal a pantalla completa con la misma cabecera que las pantallas (con ✕ para cerrar). */
export function FullScreenModal({
  visible,
  onClose,
  title,
  subtitle,
  children,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  testID?: string;
}) {
  const { c } = useTheme();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: c.bg, alignItems: "center" }} testID={testID}>
        <View style={{ flex: 1, width: "100%", maxWidth: 760, paddingHorizontal: space.lg }}>
          <ScreenHeader title={title} subtitle={subtitle} onBack={onClose} backIcon="close" />
          {children}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

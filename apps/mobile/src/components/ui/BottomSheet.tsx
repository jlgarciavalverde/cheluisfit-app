import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";
import { Text } from "./Text";

/** Hoja inferior modal con título; se cierra tocando fuera o con «atrás» en Android. */
export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { c } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable
          accessibilityLabel="Cerrar"
          onPress={onClose}
          style={{ flex: 1, backgroundColor: c.overlay, justifyContent: "flex-end" }}
        >
          <Pressable onPress={() => {}} accessible={false}>
            <SafeAreaView
              edges={["bottom"]}
              style={{
                backgroundColor: c.surface,
                borderTopLeftRadius: radius.xl,
                borderTopRightRadius: radius.xl,
                padding: space.lg,
                alignItems: "center",
              }}
            >
              <View style={{ width: "100%", maxWidth: 560, gap: space.lg }}>
                <View style={{ width: 40, height: 4, borderRadius: radius.pill, backgroundColor: c.border, alignSelf: "center" }} />
                <View style={{ gap: 2 }}>
                  <Text variant="heading" accessibilityRole="header">
                    {title}
                  </Text>
                  {subtitle ? (
                    <Text variant="body" color="muted" numberOfLines={1}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                {children}
              </View>
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const IS_WEB = Platform.OS === "web";

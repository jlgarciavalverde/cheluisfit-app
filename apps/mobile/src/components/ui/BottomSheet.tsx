import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
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
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: "flex-end" }}>
        {/* Fondo: capa aparte, detrás de la hoja (no la envuelve), para que «Cerrar hoja» sea un
            botón sin anidar dentro los controles de la hoja. Tocar fuera cierra. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar hoja"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]}
        />
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
          {/* Una hoja alta (formulario largo + teclado) se desplaza dentro en vez de salirse por arriba. */}
          <ScrollView
            style={{ width: "100%", maxWidth: 560, maxHeight: height - insets.top - space.xl }}
            contentContainerStyle={{ gap: space.lg }}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
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
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const IS_WEB = Platform.OS === "web";

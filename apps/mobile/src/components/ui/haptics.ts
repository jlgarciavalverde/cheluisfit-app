import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const native = Platform.OS !== "web";

export const haptic = {
  tap: () => native && Haptics.selectionAsync().catch(() => {}),
  success: () =>
    native && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warn: () =>
    native && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
};

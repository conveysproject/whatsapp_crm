import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, space } from "../lib/theme";

export interface Option { label: string; value: string }

/** Bottom-sheet list used instead of Alert.alert (Android alerts cap at 3 buttons). */
export function OptionSheet({ visible, title, options, onSelect, onClose }: {
  visible: boolean;
  title?: string;
  options: Option[];
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.md) + space.sm }]}>
        {title ? <Text style={styles.title} accessibilityRole="header">{title}</Text> : null}
        {options.map((o) => (
          <Pressable key={o.value} accessibilityRole="button" onPress={() => { onClose(); onSelect(o.value); }} style={styles.row}>
            <Text style={styles.text}>{o.label}</Text>
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.row}>
          <Text style={[styles.text, styles.cancel]}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(17,24,39,0.35)" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: space.sm },
  title: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted, paddingHorizontal: space.lg, paddingVertical: space.sm },
  row: { minHeight: 52, justifyContent: "center", paddingHorizontal: space.lg },
  text: { fontFamily: font.regular, fontSize: 16, color: colors.text },
  cancel: { color: colors.textMuted },
});

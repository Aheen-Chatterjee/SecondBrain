import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../lib/theme';

export interface RailAction {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress: () => void;
}

function RailButton({ action }: { action: RailAction }) {
  const { colors } = useTheme();
  return (
    <View style={styles.item}>
      <Pressable
        onPress={action.onPress}
        accessibilityRole="button"
        accessibilityLabel={action.label}
        style={({ pressed }) => [
          styles.circle,
          {
            backgroundColor: action.active ? colors.accent : colors.surface,
            borderColor: colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Ionicons
          name={action.icon}
          size={22}
          color={action.active ? '#FFFFFF' : colors.text}
        />
      </Pressable>
      <Text style={[styles.label, { color: colors.textMuted }]}>
        {action.label}
      </Text>
    </View>
  );
}

export function ActionRail({ actions }: { actions: RailAction[] }) {
  return (
    <View style={styles.rail}>
      {actions.map((a) => (
        <RailButton key={a.key} action={a} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { alignItems: 'center', gap: 18 },
  item: { alignItems: 'center', gap: 4 },
  circle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 10, fontWeight: '600' },
});

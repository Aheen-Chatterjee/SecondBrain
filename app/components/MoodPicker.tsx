import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../lib/theme';

interface Props {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  // Emoji/labels rendered above the 1..5 scale ends.
  lowHint?: string;
  highHint?: string;
}

/** 1–5 pill selector used for mood and energy. Tapping the active pill clears. */
export function MoodPicker({ label, value, onChange, lowHint, highHint }: Props) {
  const { colors, radius } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: colors.textFaint }]}>{label}</Text>
        {lowHint && highHint ? (
          <Text style={[styles.hint, { color: colors.textFaint }]}>
            {lowHint} → {highHint}
          </Text>
        ) : null}
      </View>
      <View style={styles.row}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = value === n;
          return (
            <Pressable
              key={n}
              onPress={() => onChange(active ? null : n)}
              style={({ pressed }) => [
                styles.pill,
                {
                  borderRadius: radius.pill,
                  backgroundColor: active ? colors.accent : colors.surfaceAlt,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.pillText,
                  { color: active ? '#FFFFFF' : colors.textMuted },
                ]}
              >
                {n}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  hint: { fontSize: 11 },
  row: { flexDirection: 'row', gap: 8 },
  pill: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { fontSize: 16, fontWeight: '600' },
});

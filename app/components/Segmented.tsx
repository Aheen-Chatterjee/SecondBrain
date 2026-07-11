import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../lib/theme';

interface Props<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: Props<T>) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.surfaceAlt, borderRadius: radius.input },
      ]}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.seg,
              {
                borderRadius: radius.input - 2,
                backgroundColor: active ? colors.surface : 'transparent',
                borderWidth: active ? StyleSheet.hairlineWidth : 0,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: active ? colors.text : colors.textMuted },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', padding: 3 },
  seg: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 14, fontWeight: '600' },
});

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../lib/theme';
import { Button } from './Button';

export function Loading({ label }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accent} />
      {label ? (
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      ) : null}
    </View>
  );
}

export function ErrorView({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const { colors, serif } = useTheme();
  return (
    <View style={styles.center}>
      <Text style={[styles.errTitle, { color: colors.text, fontFamily: serif }]}>
        Couldn’t load this
      </Text>
      <Text style={[styles.errMsg, { color: colors.textMuted }]}>{message}</Text>
      {onRetry ? (
        <View style={{ marginTop: 20 }}>
          <Button title="Try again" variant="secondary" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  label: { marginTop: 12, fontSize: 14 },
  errTitle: { fontSize: 20, letterSpacing: -0.3 },
  errMsg: { fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 21 },
});

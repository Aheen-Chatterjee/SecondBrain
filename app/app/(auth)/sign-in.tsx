import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';

export default function SignIn() {
  const { colors, serif, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    supabaseConfigured,
    signInWithPassword,
    signUpWithPassword,
    continueDevMode,
  } = useAuth();

  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signIn') await signInWithPassword(email.trim(), password);
      else await signUpWithPassword(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }

  async function devMode() {
    setBusy(true);
    try {
      await continueDevMode();
    } finally {
      setBusy(false);
    }
  }

  function inputStyle(key: string) {
    return [
      styles.input,
      {
        backgroundColor: colors.surfaceAlt,
        color: colors.text,
        borderColor: focused === key ? colors.accent : 'transparent',
      },
    ];
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.brand, { color: colors.accent, fontFamily: serif }]}>
          Second Brain
        </Text>
        <Text style={[styles.tagline, { color: colors.textMuted }]}>
          Remember what matters.
        </Text>

        <View style={{ height: spacing.xxl }} />

        {supabaseConfigured ? (
          <>
            <TextInput
              style={inputStyle('email')}
              placeholder="Email"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused(null)}
            />
            <TextInput
              style={inputStyle('password')}
              placeholder="Password"
              placeholderTextColor={colors.textFaint}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
            />

            {error ? (
              <Text style={[styles.error, { color: colors.danger }]}>
                {error}
              </Text>
            ) : null}

            <View style={{ height: spacing.md }} />
            <Button
              title={mode === 'signIn' ? 'Sign in' : 'Create account'}
              onPress={submit}
              loading={busy}
              fullWidth
            />
            <Pressable
              onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
              style={styles.switch}
            >
              <Text style={{ color: colors.textMuted }}>
                {mode === 'signIn'
                  ? 'New here? '
                  : 'Already have an account? '}
                <Text style={{ color: colors.accent, fontWeight: '600' }}>
                  {mode === 'signIn' ? 'Create one' : 'Sign in'}
                </Text>
              </Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.devCard}>
            <Text style={[styles.devTitle, { color: colors.text }]}>
              No Supabase configured
            </Text>
            <Text style={[styles.devBody, { color: colors.textMuted }]}>
              Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to
              enable email sign-in. For now you can explore in dev mode.
            </Text>
            <View style={{ height: spacing.lg }} />
            <Button
              title="Continue in dev mode"
              onPress={devMode}
              loading={busy}
              fullWidth
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 28, flexGrow: 1, justifyContent: 'center' },
  brand: { fontSize: 40, letterSpacing: -0.5, textAlign: 'center' },
  tagline: { fontSize: 16, textAlign: 'center', marginTop: 8 },
  input: {
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1.5,
  },
  error: { fontSize: 14, marginTop: 4 },
  switch: { alignItems: 'center', marginTop: 20 },
  devCard: { alignItems: 'center' },
  devTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  devBody: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
});

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
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
import { Button } from '../components/Button';
import { ErrorView, Loading } from '../components/StateViews';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import type { AiTone, NotifFrequency, Profile } from '../lib/types';
import { errorMessage, useAsync } from '../lib/useAsync';

const TONES: { value: AiTone; label: string }[] = [
  { value: 'warm', label: 'Warm' },
  { value: 'coach', label: 'Coach' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'socratic', label: 'Socratic' },
];

const FREQS: { value: NotifFrequency; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'daily', label: 'Daily' },
  { value: 'twice_daily', label: 'Twice daily' },
  { value: 'weekly', label: 'Weekly' },
];

export default function Settings() {
  const { colors, serif, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useAuth();

  const { data, loading, error, reload } = useAsync(() => api.getProfile(), []);

  const [displayName, setDisplayName] = useState('');
  const [tone, setTone] = useState<AiTone>('warm');
  const [freq, setFreq] = useState<NotifFrequency>('daily');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (data) {
      setDisplayName(data.display_name ?? '');
      setTone(data.ai_tone);
      setFreq(data.notif_frequency);
    }
  }, [data]);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const body: Partial<Profile> = {
        display_name: displayName.trim() || null,
        ai_tone: tone,
        notif_frequency: freq,
      };
      await api.updateProfile(body);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      Alert.alert('Save failed', errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function confirmSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/sign-in');
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.topbar, { paddingTop: insets.top + 8 }]}>
        <Text style={[styles.title, { color: colors.text, fontFamily: serif }]}>
          Settings
        </Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorView message={error} onRetry={reload} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.label, { color: colors.textFaint }]}>
            DISPLAY NAME
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceAlt,
                color: colors.text,
                borderColor: focused ? colors.accent : 'transparent',
              },
            ]}
            placeholder="Your name"
            placeholderTextColor={colors.textFaint}
            value={displayName}
            onChangeText={setDisplayName}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />

          <Text style={[styles.label, { color: colors.textFaint, marginTop: spacing.xl }]}>
            AI TONE
          </Text>
          <View style={styles.optRow}>
            {TONES.map((t) => (
              <Pressable
                key={t.value}
                onPress={() => setTone(t.value)}
                style={[
                  styles.opt,
                  {
                    backgroundColor: tone === t.value ? colors.accentSoft : colors.surfaceAlt,
                    borderColor: tone === t.value ? colors.accent : 'transparent',
                  },
                ]}
              >
                <Text style={{ color: tone === t.value ? colors.accent : colors.textMuted, fontWeight: '600' }}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.label, { color: colors.textFaint, marginTop: spacing.xl }]}>
            NOTIFICATION FREQUENCY
          </Text>
          <View style={styles.optRow}>
            {FREQS.map((f) => (
              <Pressable
                key={f.value}
                onPress={() => setFreq(f.value)}
                style={[
                  styles.opt,
                  {
                    backgroundColor: freq === f.value ? colors.accentSoft : colors.surfaceAlt,
                    borderColor: freq === f.value ? colors.accent : 'transparent',
                  },
                ]}
              >
                <Text style={{ color: freq === f.value ? colors.accent : colors.textMuted, fontWeight: '600' }}>
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Button
            title={saved ? 'Saved' : 'Save changes'}
            icon={saved ? 'checkmark' : undefined}
            onPress={save}
            loading={saving}
            fullWidth
            style={{ marginTop: spacing.xxl }}
          />

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Button
            title="Sign out"
            variant="text"
            onPress={confirmSignOut}
            fullWidth
          />
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 26, letterSpacing: -0.3 },
  label: { fontSize: 11, letterSpacing: 1, fontWeight: '600', marginBottom: 10 },
  input: {
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1.5,
  },
  optRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opt: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 24,
  },
});

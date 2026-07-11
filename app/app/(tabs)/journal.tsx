import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { Card } from '../../components/Card';
import { MoodPicker } from '../../components/MoodPicker';
import { api, ApiError } from '../../lib/api';
import {
  longDate,
  parseISODate,
  relativeDay,
  toISODate,
  weekdayShort,
} from '../../lib/format';
import { useTheme } from '../../lib/theme';
import type { JournalEntry, JournalEntrySummary } from '../../lib/types';

function lastNDays(n: number): Date[] {
  const out: Date[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(d);
  }
  return out;
}

export default function JournalScreen() {
  const { colors, serif, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const todayISO = toISODate(new Date());
  const [selectedDate, setSelectedDate] = useState(todayISO);

  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [body, setBody] = useState('');
  const [mood, setMood] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [focused, setFocused] = useState(false);

  const [monthEntries, setMonthEntries] = useState<
    Record<string, JournalEntrySummary>
  >({});
  const [onThisDay, setOnThisDay] = useState<JournalEntrySummary[]>([]);
  const [aiOnline, setAiOnline] = useState<boolean | null>(null);

  const skipAutosave = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const days = useMemo(() => lastNDays(14), []);

  // One-time context loads.
  useEffect(() => {
    api.health()
      .then((h) => setAiOnline(h.ai))
      .catch(() => setAiOnline(null));
    api.onThisDay()
      .then((r) => setOnThisDay(r.entries))
      .catch(() => {});
    const now = new Date();
    api.listJournalMonth(now.getFullYear(), now.getMonth() + 1)
      .then((r) => {
        const map: Record<string, JournalEntrySummary> = {};
        r.entries.forEach((e) => (map[e.entry_date] = e));
        setMonthEntries(map);
      })
      .catch(() => {});
  }, []);

  // Load the entry whenever the selected date changes.
  useEffect(() => {
    let active = true;
    skipAutosave.current = true;
    setLoading(true);
    setSaveState('idle');
    api.getJournalEntry(selectedDate)
      .then((e) => {
        if (!active) return;
        setEntry(e);
        setBody(e.body);
        setMood(e.mood);
        setEnergy(e.energy);
      })
      .catch((err) => {
        if (!active) return;
        // 404 = no entry for this day yet: start blank.
        if (err instanceof ApiError && err.status === 404) {
          setEntry(null);
          setBody('');
          setMood(null);
          setEnergy(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedDate]);

  const doSave = useCallback(
    async (nextBody: string, nextMood: number | null, nextEnergy: number | null) => {
      setSaveState('saving');
      try {
        const saved = await api.saveJournalEntry(selectedDate, {
          body: nextBody,
          mood: nextMood,
          energy: nextEnergy,
        });
        setEntry(saved);
        setSaveState('saved');
        setMonthEntries((prev) => ({
          ...prev,
          [selectedDate]: {
            id: saved.id,
            entry_date: saved.entry_date,
            mood: saved.mood,
            energy: saved.energy,
            preview: saved.body.slice(0, 140),
          },
        }));
      } catch {
        setSaveState('idle');
      }
    },
    [selectedDate]
  );

  // Debounced autosave on any content change.
  useEffect(() => {
    if (skipAutosave.current) {
      skipAutosave.current = false;
      return;
    }
    if (body.trim() === '' && mood === null && energy === null) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      doSave(body, mood, energy);
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [body, mood, energy, doSave]);

  async function openChat() {
    let entryId = entry?.id;
    if (!entryId) {
      // Ensure the entry exists so the chat has something to attach to.
      const saved = await api.saveJournalEntry(selectedDate, {
        body,
        mood,
        energy,
      });
      setEntry(saved);
      entryId = saved.id;
    }
    router.push(`/chat/${entryId}`);
  }

  const selDate = parseISODate(selectedDate);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 40,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.overline, { color: colors.textFaint }]}>
              {relativeDay(selectedDate)}
            </Text>
            <Text
              style={[styles.dateTitle, { color: colors.text, fontFamily: serif }]}
            >
              {longDate(selDate)}
            </Text>
          </View>
          <View style={styles.saveHint}>
            {saveState === 'saving' ? (
              <ActivityIndicator size="small" color={colors.textFaint} />
            ) : saveState === 'saved' ? (
              <Ionicons
                name="checkmark-circle"
                size={18}
                color={colors.success}
              />
            ) : null}
          </View>
        </View>

        {aiOnline === false ? (
          <Text style={[styles.aiHint, { color: colors.textFaint }]}>
            AI offline · reflections use simple prompts
          </Text>
        ) : null}

        {/* Date strip */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
        >
          {days.map((d) => {
            const iso = toISODate(d);
            const active = iso === selectedDate;
            const has = !!monthEntries[iso];
            return (
              <Pressable
                key={iso}
                onPress={() => setSelectedDate(iso)}
                style={[
                  styles.dayPill,
                  {
                    backgroundColor: active ? colors.accent : colors.surfaceAlt,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.dayWeek,
                    { color: active ? '#FFFFFF' : colors.textFaint },
                  ]}
                >
                  {weekdayShort(d)}
                </Text>
                <Text
                  style={[
                    styles.dayNum,
                    { color: active ? '#FFFFFF' : colors.text },
                  ]}
                >
                  {d.getDate()}
                </Text>
                <View
                  style={[
                    styles.dayDot,
                    {
                      backgroundColor: has
                        ? active
                          ? '#FFFFFF'
                          : colors.accent
                        : 'transparent',
                    },
                  ]}
                />
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Editor */}
        <View style={styles.editorWrap}>
          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
          ) : (
            <TextInput
              style={[
                styles.editor,
                { color: colors.text, fontFamily: serif },
                focused ? { opacity: 1 } : null,
              ]}
              placeholder="What happened today? What’s on your mind?"
              placeholderTextColor={colors.textFaint}
              multiline
              value={body}
              onChangeText={setBody}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              textAlignVertical="top"
              scrollEnabled={false}
            />
          )}
        </View>

        {/* Mood + energy */}
        <View style={styles.pickers}>
          <MoodPicker
            label="Mood"
            value={mood}
            onChange={setMood}
            lowHint="low"
            highHint="great"
          />
          <View style={{ height: spacing.lg }} />
          <MoodPicker
            label="Energy"
            value={energy}
            onChange={setEnergy}
            lowHint="drained"
            highHint="charged"
          />
        </View>

        <View style={styles.chatBtn}>
          <Button
            title="Chat about today"
            icon="chatbubbles-outline"
            variant="secondary"
            onPress={openChat}
            fullWidth
          />
        </View>

        {/* On this day */}
        {onThisDay.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>
              ON THIS DAY
            </Text>
            {onThisDay.map((e) => (
              <Card
                key={e.id}
                style={{ marginBottom: spacing.md }}
                onPress={() => setSelectedDate(e.entry_date)}
              >
                <Text style={[styles.otdDate, { color: colors.accent }]}>
                  {relativeDay(e.entry_date)} · {e.entry_date}
                </Text>
                <Text
                  style={[styles.otdPreview, { color: colors.text }]}
                  numberOfLines={3}
                >
                  {e.preview}
                </Text>
              </Card>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  overline: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  dateTitle: { fontSize: 26, letterSpacing: -0.3, marginTop: 2 },
  saveHint: { width: 24, alignItems: 'flex-end', paddingTop: 20 },
  aiHint: { fontSize: 12, paddingHorizontal: 20, marginBottom: 4 },
  strip: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  dayPill: {
    width: 48,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    gap: 3,
  },
  dayWeek: { fontSize: 11, fontWeight: '600' },
  dayNum: { fontSize: 17, fontWeight: '700' },
  dayDot: { width: 5, height: 5, borderRadius: 3 },
  editorWrap: { paddingHorizontal: 20, minHeight: 160 },
  editor: {
    fontSize: 22,
    lineHeight: 32,
    letterSpacing: -0.3,
    minHeight: 160,
    paddingTop: 8,
  },
  pickers: { paddingHorizontal: 20, marginTop: 16 },
  chatBtn: { paddingHorizontal: 20, marginTop: 20 },
  section: { paddingHorizontal: 20, marginTop: 32 },
  sectionTitle: {
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: '600',
    marginBottom: 12,
  },
  otdDate: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  otdPreview: { fontSize: 15, lineHeight: 21 },
});

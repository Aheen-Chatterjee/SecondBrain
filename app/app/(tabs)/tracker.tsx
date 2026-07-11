import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorView, Loading } from '../../components/StateViews';
import { WidgetCard } from '../../components/WidgetCard';
import { api } from '../../lib/api';
import { useTheme } from '../../lib/theme';
import type {
  Widget,
  WidgetProposal,
  WidgetSize,
  WidgetType,
} from '../../lib/types';
import { errorMessage } from '../../lib/useAsync';

const WIDGET_TYPES: {
  type: WidgetType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { type: 'metric', label: 'Metric', icon: 'stats-chart-outline' },
  { type: 'habit', label: 'Habit', icon: 'flame-outline' },
  { type: 'mood_chart', label: 'Mood chart', icon: 'pulse-outline' },
  { type: 'reading_stats', label: 'Reading', icon: 'library-outline' },
  { type: 'goal', label: 'Goal', icon: 'flag-outline' },
  { type: 'journal_streak', label: 'Journal streak', icon: 'journal-outline' },
  { type: 'topics', label: 'Topics', icon: 'pricetags-outline' },
  { type: 'quote_of_day', label: 'Quote', icon: 'chatbox-ellipses-outline' },
];

export default function TrackerScreen() {
  const { colors, serif, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [proposals, setProposals] = useState<WidgetProposal[]>([]);
  const [suggestDismissed, setSuggestDismissed] = useState(false);

  // Add sheet
  const [addOpen, setAddOpen] = useState(false);
  const [newType, setNewType] = useState<WidgetType>('metric');
  const [newTitle, setNewTitle] = useState('');
  const [newSize, setNewSize] = useState<WidgetSize>('half');
  const [creating, setCreating] = useState(false);

  // Manual entry sheet
  const [manualWidget, setManualWidget] = useState<Widget | null>(null);
  const [manualValue, setManualValue] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listWidgets();
      setWidgets(res.widgets);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    api.getInsight()
      .then((r) => setInsight(r.insight))
      .catch(() => {});
    api.suggestWidgets()
      .then((r) => setProposals(r.proposals))
      .catch(() => {});
  }, [load]);

  // Refresh widgets when returning to the tab (e.g. after adding via chat).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function createWidget() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await api.createWidget({
        type: newType,
        title: newTitle.trim(),
        size: newSize,
      });
      setAddOpen(false);
      setNewTitle('');
      setNewSize('half');
      setNewType('metric');
      load();
    } catch (e) {
      Alert.alert('Couldn’t add widget', errorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  async function approveProposal(p: WidgetProposal, index: number) {
    try {
      await api.createWidget({
        type: p.widget_type,
        title: p.title,
        config: p.config,
        from_suggestion: true,
      });
      setProposals((prev) => prev.filter((_, i) => i !== index));
      load();
    } catch (e) {
      Alert.alert('Couldn’t add widget', errorMessage(e));
    }
  }

  function confirmRemove(w: Widget) {
    Alert.alert('Remove widget', `Remove “${w.title}”?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteWidget(w.id);
            setWidgets((prev) => prev.filter((x) => x.id !== w.id));
          } catch (e) {
            Alert.alert('Remove failed', errorMessage(e));
          }
        },
      },
    ]);
  }

  function onWidgetPress(w: Widget) {
    if (w.type === 'habit') {
      Alert.alert(w.title, 'Mark done for today?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Done today',
          onPress: async () => {
            try {
              await api.addWidgetData(w.id, { done: true });
              load();
            } catch (e) {
              Alert.alert('Failed', errorMessage(e));
            }
          },
        },
      ]);
    } else if (w.type === 'goal' || w.type === 'metric') {
      setManualWidget(w);
      setManualValue('');
    }
  }

  async function submitManual() {
    if (!manualWidget) return;
    const num = Number(manualValue);
    if (Number.isNaN(num)) {
      Alert.alert('Enter a number');
      return;
    }
    try {
      await api.addWidgetData(manualWidget.id, { value: num });
      setManualWidget(null);
      load();
    } catch (e) {
      Alert.alert('Failed', errorMessage(e));
    }
  }

  const screenW = Dimensions.get('window').width;
  const halfWidth = (screenW - spacing.gutter * 2 - spacing.md) / 2;
  const fullWidth = screenW - spacing.gutter * 2;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={[styles.h1, { color: colors.text, fontFamily: serif }]}>
          Tracker
        </Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => setAddOpen(true)} hitSlop={10} style={styles.headerBtn}>
            <Ionicons name="add" size={26} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => router.push('/settings')} hitSlop={10} style={styles.headerBtn}>
            <Ionicons name="settings-outline" size={22} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorView message={error} onRetry={load} />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.gutter,
            paddingBottom: insets.bottom + 40,
          }}
        >
          {insight ? (
            <View style={[styles.insight, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="bulb-outline" size={16} color={colors.accent} />
              <Text style={[styles.insightText, { color: colors.text }]}>
                {insight}
              </Text>
            </View>
          ) : null}

          {proposals.length > 0 && !suggestDismissed ? (
            <View style={[styles.suggestBanner, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={styles.suggestTop}>
                <View style={styles.suggestTitleRow}>
                  <Ionicons name="sparkles" size={15} color={colors.accent} />
                  <Text style={[styles.suggestHeading, { color: colors.text }]}>
                    Suggested widgets
                  </Text>
                </View>
                <Pressable onPress={() => setSuggestDismissed(true)} hitSlop={8}>
                  <Ionicons name="close" size={18} color={colors.textFaint} />
                </Pressable>
              </View>
              {proposals.map((p, i) => (
                <View key={`${p.widget_type}-${i}`} style={styles.proposalRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.proposalTitle, { color: colors.text }]}>
                      {p.title}
                    </Text>
                    <Text style={[styles.proposalReason, { color: colors.textMuted }]} numberOfLines={2}>
                      {p.reason}
                    </Text>
                  </View>
                  <Button
                    title="Approve"
                    onPress={() => approveProposal(p, i)}
                    variant="secondary"
                    style={styles.approveBtn}
                  />
                </View>
              ))}
            </View>
          ) : null}

          {widgets.length === 0 ? (
            <EmptyState
              icon="grid-outline"
              title="Build your dashboard"
              subtitle="Add widgets to track habits, mood, reading and goals."
              actionLabel="Add a widget"
              onAction={() => setAddOpen(true)}
            />
          ) : (
            <View style={styles.grid}>
              {widgets.map((w) => (
                <View
                  key={w.id}
                  style={{ width: w.size === 'full' ? fullWidth : halfWidth }}
                >
                  <WidgetCard
                    widget={w}
                    onPress={() => onWidgetPress(w)}
                    onLongPress={() => confirmRemove(w)}
                  />
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Add widget sheet */}
      <Modal
        visible={addOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setAddOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setAddOpen(false)} />
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 20 }]}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.text, fontFamily: serif }]}>
            Add a widget
          </Text>

          <View style={styles.typeGrid}>
            {WIDGET_TYPES.map((t) => {
              const active = newType === t.type;
              return (
                <Pressable
                  key={t.type}
                  onPress={() => setNewType(t.type)}
                  style={[
                    styles.typeChip,
                    {
                      backgroundColor: active ? colors.accentSoft : colors.surfaceAlt,
                      borderColor: active ? colors.accent : 'transparent',
                    },
                  ]}
                >
                  <Ionicons
                    name={t.icon}
                    size={16}
                    color={active ? colors.accent : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.typeLabel,
                      { color: active ? colors.accent : colors.textMuted },
                    ]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            style={[styles.sheetInput, { backgroundColor: colors.surfaceAlt, color: colors.text }]}
            placeholder="Widget title"
            placeholderTextColor={colors.textFaint}
            value={newTitle}
            onChangeText={setNewTitle}
          />

          <View style={styles.sizeRow}>
            {(['half', 'full'] as WidgetSize[]).map((s) => (
              <Pressable
                key={s}
                onPress={() => setNewSize(s)}
                style={[
                  styles.sizeBtn,
                  {
                    backgroundColor: newSize === s ? colors.accentSoft : colors.surfaceAlt,
                    borderColor: newSize === s ? colors.accent : 'transparent',
                  },
                ]}
              >
                <Text style={{ color: newSize === s ? colors.accent : colors.textMuted, fontWeight: '600' }}>
                  {s === 'half' ? 'Half width' : 'Full width'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Button
            title="Add widget"
            onPress={createWidget}
            loading={creating}
            disabled={!newTitle.trim()}
            fullWidth
            style={{ marginTop: 16 }}
          />
        </View>
      </Modal>

      {/* Manual data entry sheet */}
      <Modal
        visible={manualWidget !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setManualWidget(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setManualWidget(null)} />
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 20 }]}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.text, fontFamily: serif }]}>
            {manualWidget?.title ?? ''}
          </Text>
          <Text style={[styles.manualHint, { color: colors.textMuted }]}>
            Log a value for today.
          </Text>
          <TextInput
            style={[styles.sheetInput, { backgroundColor: colors.surfaceAlt, color: colors.text }]}
            placeholder="Enter a number"
            placeholderTextColor={colors.textFaint}
            keyboardType="numeric"
            value={manualValue}
            onChangeText={setManualValue}
            autoFocus
          />
          <Button
            title="Save"
            onPress={submitManual}
            disabled={manualValue.trim() === ''}
            fullWidth
            style={{ marginTop: 16 }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  h1: { fontSize: 30, letterSpacing: -0.5 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerBtn: { padding: 4 },
  insight: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 14,
    borderRadius: 14,
    marginTop: 8,
    marginBottom: 12,
  },
  insightText: { flex: 1, fontSize: 14, lineHeight: 20 },
  suggestBanner: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 16,
  },
  suggestTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  suggestTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  suggestHeading: { fontSize: 15, fontWeight: '700' },
  proposalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  proposalTitle: { fontSize: 15, fontWeight: '600' },
  proposalReason: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  approveBtn: { height: 38, paddingHorizontal: 16 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 22, letterSpacing: -0.3, marginBottom: 16 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  typeLabel: { fontSize: 13, fontWeight: '600' },
  sheetInput: {
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  sizeRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  sizeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  manualHint: { fontSize: 14, marginBottom: 16, marginTop: -6 },
});

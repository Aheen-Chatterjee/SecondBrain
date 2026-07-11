import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '../lib/theme';
import type {
  GoalData,
  HabitData,
  JournalStreakData,
  MetricData,
  MoodChartData,
  QuoteOfDayData,
  ReadingStatsData,
  TopicsData,
  Widget,
} from '../lib/types';
import { Card } from './Card';

interface Props {
  widget: Widget;
  onLongPress?: () => void;
  onPress?: () => void;
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function WidgetCard({ widget, onLongPress, onPress }: Props) {
  const theme = useTheme();
  const { colors } = theme;
  return (
    <Card onLongPress={onLongPress} onPress={onPress} style={styles.card}>
      <View style={styles.header}>
        <Text
          style={[styles.title, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          {widget.title}
        </Text>
        {widget.is_ai_created ? (
          <Ionicons name="sparkles" size={12} color={colors.accent} />
        ) : null}
      </View>
      <View style={styles.body}>{renderBody(widget, theme)}</View>
    </Card>
  );
}

function renderBody(widget: Widget, theme: Theme) {
  switch (widget.type) {
    case 'metric':
      return <MetricBody data={widget.data as MetricData} theme={theme} />;
    case 'habit':
      return <HabitBody data={widget.data as HabitData} theme={theme} />;
    case 'mood_chart':
      return <MoodChartBody data={widget.data as MoodChartData} theme={theme} />;
    case 'reading_stats':
      return (
        <ReadingStatsBody data={widget.data as ReadingStatsData} theme={theme} />
      );
    case 'goal':
      return <GoalBody data={widget.data as GoalData} theme={theme} />;
    case 'journal_streak':
      return (
        <JournalStreakBody
          data={widget.data as JournalStreakData}
          theme={theme}
        />
      );
    case 'topics':
      return <TopicsBody data={widget.data as TopicsData} theme={theme} />;
    case 'quote_of_day':
      return <QuoteBody data={widget.data as QuoteOfDayData} theme={theme} />;
    default:
      return null;
  }
}

function MetricBody({ data, theme }: { data: MetricData; theme: Theme }) {
  const { colors, serif } = theme;
  return (
    <View>
      <Text style={[styles.bigNumber, { color: colors.text, fontFamily: serif }]}>
        {data?.value ?? 0}
      </Text>
      <Text style={[styles.caption, { color: colors.textFaint }]}>
        {data?.label ?? ''}
      </Text>
    </View>
  );
}

function HabitBody({ data, theme }: { data: HabitData; theme: Theme }) {
  const { colors } = theme;
  const week = data?.week ?? [];
  return (
    <View>
      <View style={styles.streakRow}>
        <Ionicons name="flame" size={18} color={colors.accent} />
        <Text style={[styles.streakNum, { color: colors.text }]}>
          {data?.streak ?? 0}
        </Text>
        <Text style={[styles.caption, { color: colors.textFaint }]}>
          day streak
        </Text>
      </View>
      <View style={styles.dotsRow}>
        {DAY_LETTERS.map((letter, i) => {
          const done = week[i];
          return (
            <View key={i} style={styles.dotCol}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: done ? colors.accent : colors.surfaceAlt,
                    borderColor: colors.border,
                  },
                ]}
              />
              <Text style={[styles.dotLabel, { color: colors.textFaint }]}>
                {letter}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function MoodChartBody({ data, theme }: { data: MoodChartData; theme: Theme }) {
  const { colors } = theme;
  // Show the most recent ~14 days as plain bars (avoids a chart lib).
  const points = (data?.points ?? []).slice(-14);
  if (points.length === 0) {
    return (
      <Text style={[styles.caption, { color: colors.textFaint }]}>
        No entries yet
      </Text>
    );
  }
  return (
    <View>
      <View style={styles.chart}>
        {points.map((p, i) => {
          const moodH = p.mood ? (p.mood / 5) * 56 : 2;
          const energyH = p.energy ? (p.energy / 5) * 56 : 0;
          return (
            <View key={i} style={styles.barGroup}>
              <View style={styles.barStack}>
                <View
                  style={[
                    styles.bar,
                    { height: energyH, backgroundColor: colors.accentSoft },
                  ]}
                />
                <View
                  style={[
                    styles.bar,
                    styles.barFront,
                    { height: moodH, backgroundColor: colors.accent },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.legendRow}>
        <Legend color={colors.accent} label="Mood" theme={theme} />
        <Legend color={colors.accentSoft} label="Energy" theme={theme} />
      </View>
    </View>
  );
}

function Legend({
  color,
  label,
  theme,
}: {
  color: string;
  label: string;
  theme: Theme;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={[styles.caption, { color: theme.colors.textFaint }]}>
        {label}
      </Text>
    </View>
  );
}

function ReadingStatsBody({
  data,
  theme,
}: {
  data: ReadingStatsData;
  theme: Theme;
}) {
  const { colors, serif } = theme;
  const by = data?.by_source ?? { book: 0, youtube: 0, link: 0, note: 0 };
  return (
    <View>
      <Text style={[styles.bigNumber, { color: colors.text, fontFamily: serif }]}>
        {data?.captured_this_week ?? 0}
      </Text>
      <Text style={[styles.caption, { color: colors.textFaint }]}>
        captured this week
      </Text>
      <View style={styles.sourceRow}>
        <SourceStat icon="book-outline" n={by.book} theme={theme} />
        <SourceStat icon="logo-youtube" n={by.youtube} theme={theme} />
        <SourceStat icon="link-outline" n={by.link} theme={theme} />
        <SourceStat icon="document-text-outline" n={by.note} theme={theme} />
      </View>
    </View>
  );
}

function SourceStat({
  icon,
  n,
  theme,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  n: number;
  theme: Theme;
}) {
  const { colors } = theme;
  return (
    <View style={styles.sourceStat}>
      <Ionicons name={icon} size={16} color={colors.textMuted} />
      <Text style={[styles.sourceNum, { color: colors.text }]}>{n}</Text>
    </View>
  );
}

function GoalBody({ data, theme }: { data: GoalData; theme: Theme }) {
  const { colors, serif } = theme;
  const current = data?.current ?? 0;
  const target = data?.target ?? 0;
  const pct = target > 0 ? Math.min(1, current / target) : 0;
  return (
    <View>
      <Text style={[styles.bigNumber, { color: colors.text, fontFamily: serif }]}>
        {current}
        <Text style={[styles.goalTarget, { color: colors.textFaint }]}>
          {' '}
          / {target}
        </Text>
      </Text>
      <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
        <View
          style={[
            styles.fill,
            { width: `${pct * 100}%`, backgroundColor: colors.accent },
          ]}
        />
      </View>
      <Text style={[styles.caption, { color: colors.textFaint }]}>
        {Math.round(pct * 100)}% complete
      </Text>
    </View>
  );
}

function JournalStreakBody({
  data,
  theme,
}: {
  data: JournalStreakData;
  theme: Theme;
}) {
  const { colors, serif } = theme;
  return (
    <View>
      <View style={styles.streakRow}>
        <Ionicons name="flame" size={20} color={colors.accent} />
        <Text
          style={[styles.bigNumber, { color: colors.text, fontFamily: serif }]}
        >
          {data?.streak ?? 0}
        </Text>
      </View>
      <Text style={[styles.caption, { color: colors.textFaint }]}>
        day journal streak · best {data?.best ?? 0}
      </Text>
    </View>
  );
}

function TopicsBody({ data, theme }: { data: TopicsData; theme: Theme }) {
  const { colors } = theme;
  const topics = (data?.topics ?? []).slice(0, 6);
  if (topics.length === 0) {
    return (
      <Text style={[styles.caption, { color: colors.textFaint }]}>
        No topics yet
      </Text>
    );
  }
  return (
    <View style={styles.chipWrap}>
      {topics.map((t) => (
        <View
          key={t.name}
          style={[styles.topicChip, { backgroundColor: colors.surfaceAlt }]}
        >
          <Text style={[styles.topicText, { color: colors.textMuted }]}>
            {t.name}
          </Text>
          <Text style={[styles.topicCount, { color: colors.accent }]}>
            {t.count}
          </Text>
        </View>
      ))}
    </View>
  );
}

function QuoteBody({ data, theme }: { data: QuoteOfDayData; theme: Theme }) {
  const { colors, serif } = theme;
  if (!data?.text) {
    return (
      <Text style={[styles.caption, { color: colors.textFaint }]}>
        No quotes yet
      </Text>
    );
  }
  return (
    <View>
      <Text
        style={[styles.quoteText, { color: colors.text, fontFamily: serif }]}
      >
        “{data.text}”
      </Text>
      <Text style={[styles.caption, { color: colors.textFaint, marginTop: 8 }]}>
        {data.title}
        {data.author ? ` · ${data.author}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 120, justifyContent: 'flex-start' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 12,
  },
  title: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
    flexShrink: 1,
  },
  body: { flex: 1 },
  bigNumber: { fontSize: 36, letterSpacing: -0.5 },
  caption: { fontSize: 12, marginTop: 2 },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  streakNum: { fontSize: 28, fontWeight: '700' },
  dotsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  dotCol: { alignItems: 'center', gap: 4 },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dotLabel: { fontSize: 10 },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 60,
    gap: 3,
    marginTop: 4,
  },
  barGroup: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barStack: { width: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '80%', borderRadius: 2 },
  barFront: { position: 'absolute', bottom: 0 },
  legendRow: { flexDirection: 'row', gap: 16, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  sourceRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  sourceStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sourceNum: { fontSize: 15, fontWeight: '600' },
  goalTarget: { fontSize: 18 },
  track: {
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 12,
    marginBottom: 8,
  },
  fill: { height: '100%', borderRadius: 999 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  topicChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  topicText: { fontSize: 12, fontWeight: '600' },
  topicCount: { fontSize: 12, fontWeight: '700' },
  quoteText: { fontSize: 17, lineHeight: 24, letterSpacing: -0.2 },
});

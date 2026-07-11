import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { ErrorView, Loading } from '../../components/StateViews';
import { api } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { useTheme } from '../../lib/theme';
import type { Highlight } from '../../lib/types';
import { errorMessage, useAsync } from '../../lib/useAsync';

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, serif, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data, loading, error, reload, setData } = useAsync(
    () => api.getItem(id as string),
    [id]
  );
  const [distilling, setDistilling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function distill() {
    if (!data) return;
    setDistilling(true);
    try {
      const res = await api.distillItem(data.id);
      setData((prev) =>
        prev
          ? { ...prev, highlights: [...res.highlights, ...prev.highlights] }
          : prev
      );
    } catch (e) {
      Alert.alert('Distill failed', errorMessage(e));
    } finally {
      setDistilling(false);
    }
  }

  function confirmDelete() {
    if (!data) return;
    Alert.alert('Delete item', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await api.deleteItem(data.id);
            router.back();
          } catch (e) {
            setDeleting(false);
            Alert.alert('Delete failed', errorMessage(e));
          }
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.topbar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-down" size={26} color={colors.textMuted} />
        </Pressable>
        {data ? (
          <Pressable onPress={confirmDelete} hitSlop={12} disabled={deleting}>
            <Ionicons name="trash-outline" size={22} color={colors.danger} />
          </Pressable>
        ) : (
          <View />
        )}
      </View>

      {loading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorView message={error ?? 'Not found'} onRetry={reload} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        >
          <Text style={[styles.overline, { color: colors.textFaint }]}>
            {data.source} · {data.type} · {timeAgo(data.captured_at)}
          </Text>
          <Text style={[styles.title, { color: colors.text, fontFamily: serif }]}>
            {data.title}
          </Text>
          {data.author ? (
            <Text style={[styles.author, { color: colors.textMuted }]}>
              {data.author}
            </Text>
          ) : null}

          {data.thumbnail_url ? (
            <Image
              source={{ uri: data.thumbnail_url }}
              style={[styles.thumb, { borderColor: colors.border }]}
              resizeMode="cover"
            />
          ) : null}

          {data.tags.length > 0 ? (
            <View style={styles.tags}>
              {data.tags.map((t) => (
                <Chip key={t} label={t} />
              ))}
            </View>
          ) : null}

          {data.summary ? (
            <Card style={{ marginTop: spacing.lg }}>
              <Text style={[styles.sectionLabel, { color: colors.textFaint }]}>
                SUMMARY
              </Text>
              <Text style={[styles.summary, { color: colors.text }]}>
                {data.summary}
              </Text>
            </Card>
          ) : null}

          <View style={styles.actions}>
            <Button
              title="Distill principles"
              icon="sparkles-outline"
              variant="secondary"
              onPress={distill}
              loading={distilling}
              fullWidth
            />
          </View>

          {/* Highlights */}
          {data.highlights.length > 0 ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>
                HIGHLIGHTS ({data.highlights.length})
              </Text>
              {data.highlights.map((h: Highlight) => (
                <Card key={h.id} style={{ marginBottom: spacing.md }}>
                  {h.photo_url ? (
                    <Image
                      source={{ uri: h.photo_url }}
                      style={styles.hlPhoto}
                      resizeMode="cover"
                    />
                  ) : null}
                  <Text style={[styles.hlText, { color: colors.text, fontFamily: serif }]}>
                    {h.text}
                  </Text>
                  {h.note ? (
                    <Text style={[styles.hlNote, { color: colors.textMuted }]}>
                      {h.note}
                    </Text>
                  ) : null}
                  <Text style={[styles.hlKind, { color: colors.textFaint }]}>
                    {h.source_kind === 'ai'
                      ? 'AI takeaway'
                      : h.source_kind === 'photo'
                        ? 'From a page'
                        : 'Logged'}
                  </Text>
                </Card>
              ))}
            </View>
          ) : null}

          {/* Raw content */}
          {data.raw_content ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>
                CONTENT
              </Text>
              <Text style={[styles.raw, { color: colors.textMuted }]}>
                {data.raw_content}
              </Text>
            </View>
          ) : null}

          {/* Related */}
          {data.related.length > 0 ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>
                CONNECTS TO
              </Text>
              {data.related.map((r) => (
                <Card
                  key={r.id}
                  style={{ marginBottom: spacing.md }}
                  onPress={() => router.push(`/item/${r.id}`)}
                >
                  <Text style={[styles.relTitle, { color: colors.text }]} numberOfLines={1}>
                    {r.title}
                  </Text>
                  <Text style={[styles.relReason, { color: colors.textMuted }]}>
                    {r.reason}
                  </Text>
                </Card>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  overline: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  title: { fontSize: 28, letterSpacing: -0.4, marginTop: 8, lineHeight: 34 },
  author: { fontSize: 16, marginTop: 4 },
  thumb: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    marginTop: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: '600',
    marginBottom: 8,
  },
  summary: { fontSize: 16, lineHeight: 24 },
  actions: { marginTop: 20 },
  section: { marginTop: 32 },
  sectionTitle: {
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: '600',
    marginBottom: 12,
  },
  hlPhoto: { width: '100%', height: 160, borderRadius: 12, marginBottom: 12 },
  hlText: { fontSize: 17, lineHeight: 25, letterSpacing: -0.2 },
  hlNote: { fontSize: 14, marginTop: 8, lineHeight: 20 },
  hlKind: { fontSize: 11, marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  raw: { fontSize: 15, lineHeight: 23 },
  relTitle: { fontSize: 15, fontWeight: '600' },
  relReason: { fontSize: 13, marginTop: 4, lineHeight: 19 },
});

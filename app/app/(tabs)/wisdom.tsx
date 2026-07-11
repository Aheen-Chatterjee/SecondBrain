import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '../../components/EmptyState';
import { ErrorView, Loading } from '../../components/StateViews';
import { WisdomCard } from '../../components/WisdomCard';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/useAsync';
import { useTheme } from '../../lib/theme';
import type {
  WisdomAction,
  WisdomCard as WisdomCardType,
  WisdomSearchResult,
} from '../../lib/types';

interface CardState {
  resonates: boolean;
  saved: boolean;
}

export default function WisdomScreen() {
  const { colors, serif } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const listRef = useRef<FlatList<WisdomCardType>>(null);

  const [cards, setCards] = useState<WisdomCardType[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cardStates, setCardStates] = useState<Record<string, CardState>>({});
  const [containerH, setContainerH] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Search overlay
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<WisdomSearchResult[]>([]);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 1800);
  };

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.wisdomFeed(null, 10);
      setCards(res.cards);
      setCursor(res.next_cursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      const res = await api.wisdomFeed(null, 10);
      setCards(res.cards);
      setCursor(res.next_cursor);
    } catch {
      // keep existing
    } finally {
      setRefreshing(false);
    }
  }

  async function loadMore() {
    if (loadingMore || !cursor) return;
    setLoadingMore(true);
    try {
      const res = await api.wisdomFeed(cursor, 10);
      setCards((prev) => [...prev, ...res.cards]);
      setCursor(res.next_cursor);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }

  async function feedback(card: WisdomCardType, action: WisdomAction) {
    try {
      await api.wisdomFeedback(card.object_type, card.object_id, action);
    } catch {
      // best-effort
    }
  }

  function toggleState(cardId: string, key: keyof CardState) {
    setCardStates((prev) => {
      const cur = prev[cardId] ?? { resonates: false, saved: false };
      return { ...prev, [cardId]: { ...cur, [key]: !cur[key] } };
    });
  }

  function scrollToNext() {
    const next = activeIndex + 1;
    if (next < cards.length && containerH > 0) {
      listRef.current?.scrollToOffset({
        offset: next * containerH,
        animated: true,
      });
    }
  }

  async function runSearch() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      const res = await api.wisdomSearch(q, 20);
      setResults(res.results);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  const dueCount = cards.filter((c) => c.due_for_review).length;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(
    (info: { viewableItems: { index: number | null }[] }) => {
      const first = info.viewableItems[0];
      if (first?.index != null) setActiveIndex(first.index);
    }
  ).current;

  return (
    <View
      style={{ flex: 1, backgroundColor: colors.bg }}
      onLayout={(e) => setContainerH(e.nativeEvent.layout.height)}
    >
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorView message={error} onRetry={loadInitial} />
      ) : cards.length === 0 ? (
        <EmptyState
          icon="sparkles-outline"
          title="Your wisdom feed is empty"
          subtitle="Capture books, links and notes — they’ll resurface here for review."
        />
      ) : containerH > 0 ? (
        <FlatList
          ref={listRef}
          data={cards}
          keyExtractor={(c) => c.card_id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={containerH}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          getItemLayout={(_, index) => ({
            length: containerH,
            offset: containerH * index,
            index,
          })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onEndReached={loadMore}
          onEndReachedThreshold={1.5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
            />
          }
          renderItem={({ item }) => {
            const st = cardStates[item.card_id] ?? {
              resonates: false,
              saved: false,
            };
            return (
              <WisdomCard
                card={item}
                height={containerH}
                resonatesActive={st.resonates}
                savedActive={st.saved}
                onResonates={() => {
                  toggleState(item.card_id, 'resonates');
                  if (!st.resonates) feedback(item, 'resonates');
                  flash('Marked as resonates');
                }}
                onSave={() => {
                  toggleState(item.card_id, 'saved');
                  if (!st.saved) feedback(item, 'save');
                  flash(st.saved ? 'Removed' : 'Saved');
                }}
                onDistill={async () => {
                  if (!item.item_id) return;
                  flash('Distilling…');
                  try {
                    await api.distillItem(item.item_id);
                    flash('Distilled into principles');
                  } catch {
                    flash('Couldn’t distill');
                  }
                }}
                onOpen={() => {
                  if (item.item_id) router.push(`/item/${item.item_id}`);
                }}
                onSnooze={() => {
                  feedback(item, 'snoozed');
                  flash('Snoozed for a week');
                  scrollToNext();
                }}
              />
            );
          }}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ height: 60, justifyContent: 'center' }}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : null
          }
        />
      ) : null}

      {/* Top overlay: due badge + search */}
      <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        {dueCount > 0 ? (
          <View style={[styles.dueBadge, { backgroundColor: colors.accent }]}>
            <Ionicons name="time-outline" size={13} color="#FFFFFF" />
            <Text style={styles.dueText}>{dueCount} due</Text>
          </View>
        ) : (
          <View />
        )}
        <Pressable
          onPress={() => setSearchOpen(true)}
          style={[styles.searchBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="search" size={20} color={colors.text} />
        </Pressable>
      </View>

      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + 20, backgroundColor: colors.text }]}>
          <Text style={[styles.toastText, { color: colors.bg }]}>{toast}</Text>
        </View>
      ) : null}

      {/* Search overlay */}
      <Modal
        visible={searchOpen}
        animationType="slide"
        onRequestClose={() => setSearchOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
          <View style={styles.searchHeader}>
            <View
              style={[styles.searchField, { backgroundColor: colors.surfaceAlt }]}
            >
              <Ionicons name="search" size={18} color={colors.textFaint} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Search your wisdom…"
                placeholderTextColor={colors.textFaint}
                value={query}
                onChangeText={setQuery}
                autoFocus
                returnKeyType="search"
                onSubmitEditing={runSearch}
              />
            </View>
            <Pressable onPress={() => setSearchOpen(false)} hitSlop={10}>
              <Text style={[styles.cancel, { color: colors.accent }]}>Cancel</Text>
            </Pressable>
          </View>

          {searching ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
          ) : results.length === 0 ? (
            <Text style={[styles.searchHint, { color: colors.textFaint, fontFamily: serif }]}>
              {query ? 'No matches.' : 'Search across everything you’ve captured.'}
            </Text>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(r) => `${r.object_type}-${r.object_id}`}
              contentContainerStyle={{ padding: 20 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    setSearchOpen(false);
                    if (item.object_type === 'item') {
                      router.push(`/item/${item.object_id}`);
                    }
                  }}
                  style={[styles.resultRow, { borderBottomColor: colors.border }]}
                >
                  <Text style={[styles.resultTitle, { color: colors.text }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={[styles.resultText, { color: colors.textMuted }]} numberOfLines={2}>
                    {item.text}
                  </Text>
                </Pressable>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  dueText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  searchBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  toastText: { fontSize: 14, fontWeight: '600' },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 16 },
  cancel: { fontSize: 15, fontWeight: '600' },
  searchHint: { fontSize: 18, textAlign: 'center', marginTop: 48, paddingHorizontal: 40, lineHeight: 26 },
  resultRow: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  resultTitle: { fontSize: 15, fontWeight: '600' },
  resultText: { fontSize: 14, marginTop: 4, lineHeight: 20 },
});

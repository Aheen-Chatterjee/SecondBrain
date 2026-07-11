import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { Chip } from '../../components/Chip';
import { Segmented } from '../../components/Segmented';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/useAsync';
import { useTheme } from '../../lib/theme';
import { timeAgo } from '../../lib/format';
import type {
  Highlight,
  KnowledgeItem,
  KnowledgeSource,
} from '../../lib/types';

type Mode = 'link' | 'note' | 'book';
type Filter = 'all' | KnowledgeSource;

const SOURCE_ICON: Record<KnowledgeSource, keyof typeof Ionicons.glyphMap> = {
  book: 'book-outline',
  youtube: 'logo-youtube',
  link: 'link-outline',
  note: 'document-text-outline',
  voice: 'mic-outline',
};

export default function CaptureScreen() {
  const { colors, serif, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('link');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  // Link
  const [url, setUrl] = useState('');
  const [linkNote, setLinkNote] = useState('');
  // Note
  const [noteText, setNoteText] = useState('');
  // Book
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [reflection, setReflection] = useState('');
  const [bookItem, setBookItem] = useState<KnowledgeItem | null>(null);
  const [bookHighlights, setBookHighlights] = useState<Highlight[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);

  // Recent items
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);

  const loadItems = useCallback(
    async (f: Filter) => {
      setItemsLoading(true);
      setItemsError(null);
      try {
        const res = await api.listItems({
          source: f === 'all' ? undefined : f,
          limit: 30,
        });
        setItems(res.items);
      } catch (e) {
        setItemsError(errorMessage(e));
      } finally {
        setItemsLoading(false);
      }
    },
    []
  );

  React.useEffect(() => {
    loadItems(filter);
  }, [filter, loadItems]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  async function saveLink() {
    if (!url.trim()) return;
    setBusy(true);
    try {
      await api.captureLink(url.trim(), linkNote.trim() || null);
      setUrl('');
      setLinkNote('');
      flash('Link captured');
      loadItems(filter);
    } catch (e) {
      Alert.alert('Capture failed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveNote() {
    if (!noteText.trim()) return;
    setBusy(true);
    try {
      await api.captureNote(noteText.trim());
      setNoteText('');
      flash('Note saved');
      loadItems(filter);
    } catch (e) {
      Alert.alert('Capture failed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveBook() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const res = await api.captureBook(
        title.trim(),
        author.trim() || null,
        reflection.trim() || null
      );
      setBookItem(res.item);
      setBookHighlights(res.highlights);
      flash('Book logged');
      loadItems(filter);
    } catch (e) {
      Alert.alert('Capture failed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function resetBook() {
    setTitle('');
    setAuthor('');
    setReflection('');
    setBookItem(null);
    setBookHighlights([]);
  }

  async function snapPage(fromCamera: boolean) {
    if (!bookItem) return;
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow access to continue.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    setPhotoBusy(true);
    try {
      const form = new FormData();
      const name = asset.fileName ?? `page-${Date.now()}.jpg`;
      const type = asset.mimeType ?? 'image/jpeg';
      // RN multipart file descriptor (cast: RN FormData accepts {uri,name,type}).
      form.append('photo', {
        uri: asset.uri,
        name,
        type,
      } as unknown as Blob);
      const res = await api.captureBookPhoto(bookItem.id, form);
      setBookHighlights((prev) => [res.highlight, ...prev]);
      flash('Page captured');
    } catch (e) {
      Alert.alert('Upload failed', errorMessage(e));
    } finally {
      setPhotoBusy(false);
    }
  }

  function inputStyle(key: string, extra?: object) {
    return [
      styles.input,
      {
        backgroundColor: colors.surfaceAlt,
        color: colors.text,
        borderColor: focused === key ? colors.accent : 'transparent',
      },
      extra,
    ];
  }

  const filters: Filter[] = ['all', 'book', 'youtube', 'link', 'note'];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 40,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.h1, { color: colors.text, fontFamily: serif }]}>
          Capture
        </Text>

        <View style={styles.segmentWrap}>
          <Segmented
            value={mode}
            onChange={(m) => setMode(m)}
            options={[
              { value: 'link', label: 'Link' },
              { value: 'note', label: 'Note' },
              { value: 'book', label: 'Book' },
            ]}
          />
        </View>

        {/* Forms */}
        <View style={styles.form}>
          {mode === 'link' ? (
            <>
              <TextInput
                style={inputStyle('url')}
                placeholder="https://…"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                value={url}
                onChangeText={setUrl}
                onFocus={() => setFocused('url')}
                onBlur={() => setFocused(null)}
              />
              <TextInput
                style={inputStyle('linkNote', styles.multiline)}
                placeholder="Add a note (optional)"
                placeholderTextColor={colors.textFaint}
                multiline
                value={linkNote}
                onChangeText={setLinkNote}
                onFocus={() => setFocused('linkNote')}
                onBlur={() => setFocused(null)}
                textAlignVertical="top"
              />
              <Button
                title="Capture link"
                onPress={saveLink}
                loading={busy}
                disabled={!url.trim()}
                fullWidth
              />
            </>
          ) : null}

          {mode === 'note' ? (
            <>
              <TextInput
                style={inputStyle('noteText', styles.bigMultiline)}
                placeholder="Write a quick note or thought…"
                placeholderTextColor={colors.textFaint}
                multiline
                value={noteText}
                onChangeText={setNoteText}
                onFocus={() => setFocused('noteText')}
                onBlur={() => setFocused(null)}
                textAlignVertical="top"
              />
              <Button
                title="Save note"
                onPress={saveNote}
                loading={busy}
                disabled={!noteText.trim()}
                fullWidth
              />
            </>
          ) : null}

          {mode === 'book' ? (
            <>
              {!bookItem ? (
                <>
                  <TextInput
                    style={inputStyle('title')}
                    placeholder="Book title"
                    placeholderTextColor={colors.textFaint}
                    value={title}
                    onChangeText={setTitle}
                    onFocus={() => setFocused('title')}
                    onBlur={() => setFocused(null)}
                  />
                  <TextInput
                    style={inputStyle('author')}
                    placeholder="Author (optional)"
                    placeholderTextColor={colors.textFaint}
                    value={author}
                    onChangeText={setAuthor}
                    onFocus={() => setFocused('author')}
                    onBlur={() => setFocused(null)}
                  />
                  <TextInput
                    style={inputStyle('reflection', styles.bigMultiline)}
                    placeholder="What did you like? What stuck with you?"
                    placeholderTextColor={colors.textFaint}
                    multiline
                    value={reflection}
                    onChangeText={setReflection}
                    onFocus={() => setFocused('reflection')}
                    onBlur={() => setFocused(null)}
                    textAlignVertical="top"
                  />
                  <Button
                    title="I read this"
                    onPress={saveBook}
                    loading={busy}
                    disabled={!title.trim()}
                    fullWidth
                  />
                </>
              ) : (
                <View>
                  <Text style={[styles.bookTitle, { color: colors.text, fontFamily: serif }]}>
                    {bookItem.title}
                  </Text>
                  {bookItem.author ? (
                    <Text style={[styles.bookAuthor, { color: colors.textMuted }]}>
                      {bookItem.author}
                    </Text>
                  ) : null}

                  <View style={styles.snapRow}>
                    <Button
                      title="Snap a page"
                      icon="camera-outline"
                      variant="secondary"
                      onPress={() => snapPage(true)}
                      loading={photoBusy}
                      style={{ flex: 1 }}
                    />
                    <Pressable
                      onPress={() => snapPage(false)}
                      style={[
                        styles.libBtn,
                        { backgroundColor: colors.surfaceAlt },
                      ]}
                    >
                      <Ionicons name="images-outline" size={20} color={colors.text} />
                    </Pressable>
                  </View>

                  <Text style={[styles.hlLabel, { color: colors.textFaint }]}>
                    {bookHighlights.length} HIGHLIGHT
                    {bookHighlights.length === 1 ? '' : 'S'}
                  </Text>
                  {bookHighlights.map((h) => (
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
                    </Card>
                  ))}

                  <Button
                    title="Log another book"
                    variant="text"
                    onPress={resetBook}
                    fullWidth
                  />
                </View>
              )}
            </>
          ) : null}
        </View>

        {/* Recent items */}
        <View style={styles.recentHeader}>
          <Text style={[styles.h2, { color: colors.text, fontFamily: serif }]}>
            Recent
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {filters.map((f) => (
            <Chip
              key={f}
              label={f === 'all' ? 'All' : f}
              active={filter === f}
              onPress={() => setFilter(f)}
            />
          ))}
        </ScrollView>

        <View style={styles.list}>
          {itemsLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
          ) : itemsError ? (
            <View style={styles.centerBox}>
              <Text style={{ color: colors.textMuted }}>{itemsError}</Text>
              <Button
                title="Retry"
                variant="text"
                onPress={() => loadItems(filter)}
              />
            </View>
          ) : items.length === 0 ? (
            <View style={styles.centerBox}>
              <Text style={[styles.emptyText, { color: colors.textFaint, fontFamily: serif }]}>
                Nothing here yet.
              </Text>
            </View>
          ) : (
            items.map((it) => (
              <Card
                key={it.id}
                style={{ marginBottom: spacing.md }}
                onPress={() => router.push(`/item/${it.id}`)}
              >
                <View style={styles.itemRow}>
                  <View
                    style={[
                      styles.itemIcon,
                      { backgroundColor: colors.surfaceAlt },
                    ]}
                  >
                    <Ionicons
                      name={SOURCE_ICON[it.source]}
                      size={18}
                      color={colors.accent}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.itemTitle, { color: colors.text }]}
                      numberOfLines={2}
                    >
                      {it.title}
                    </Text>
                    <Text style={[styles.itemMeta, { color: colors.textFaint }]}>
                      {it.author ? `${it.author} · ` : ''}
                      {it.source} · {timeAgo(it.captured_at)}
                    </Text>
                  </View>
                </View>
              </Card>
            ))
          )}
        </View>
      </ScrollView>

      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + 16, backgroundColor: colors.text }]}>
          <Ionicons name="checkmark-circle" size={16} color={colors.bg} />
          <Text style={[styles.toastText, { color: colors.bg }]}>{toast}</Text>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 30, letterSpacing: -0.5, paddingHorizontal: 20, marginBottom: 16 },
  h2: { fontSize: 22, letterSpacing: -0.3 },
  segmentWrap: { paddingHorizontal: 20 },
  form: { paddingHorizontal: 20, paddingTop: 16, gap: 12 },
  input: {
    minHeight: 52,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1.5,
  },
  multiline: { minHeight: 80 },
  bigMultiline: { minHeight: 140 },
  bookTitle: { fontSize: 24, letterSpacing: -0.3 },
  bookAuthor: { fontSize: 15, marginTop: 2 },
  snapRow: { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 20 },
  libBtn: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hlLabel: { fontSize: 11, letterSpacing: 1, fontWeight: '600', marginBottom: 12 },
  hlPhoto: { width: '100%', height: 160, borderRadius: 12, marginBottom: 12 },
  hlText: { fontSize: 17, lineHeight: 25, letterSpacing: -0.2 },
  hlNote: { fontSize: 14, marginTop: 8, lineHeight: 20 },
  recentHeader: { paddingHorizontal: 20, marginTop: 36, marginBottom: 12 },
  filterRow: { paddingHorizontal: 20, gap: 8, paddingBottom: 4 },
  list: { paddingHorizontal: 20, paddingTop: 12 },
  centerBox: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 18 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  itemMeta: { fontSize: 12, marginTop: 3 },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  toastText: { fontSize: 14, fontWeight: '600' },
});

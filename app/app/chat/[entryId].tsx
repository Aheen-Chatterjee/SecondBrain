import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../lib/api';
import { useTheme } from '../../lib/theme';
import type {
  ChatMessage,
  ChatSuggestion,
  WidgetSuggestion,
} from '../../lib/types';

export default function ChatScreen() {
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const { colors, serif } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState<ChatSuggestion[]>([]);
  const [addedKeys, setAddedKeys] = useState<Record<string, boolean>>({});
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const send = useCallback(
    async (message: string | null) => {
      if (!entryId) return;
      setSending(true);
      try {
        const res = await api.postJournalChat(entryId, message);
        setMessages((prev) => [...prev, res.reply]);
        setSuggestions(res.suggestions);
      } catch {
        // swallow; UI shows nothing new
      } finally {
        setSending(false);
      }
    },
    [entryId]
  );

  useEffect(() => {
    if (!entryId) return;
    let active = true;
    api.getJournalChat(entryId)
      .then((r) => {
        if (!active) return;
        setMessages(r.messages);
        setLoading(false);
        if (r.messages.length === 0) send(null); // auto-start reflection
      })
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [entryId, send]);

  async function submit() {
    const text = input.trim();
    if (!text || sending) return;
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput('');
    setSuggestions([]);
    await send(text);
  }

  async function addWidget(s: WidgetSuggestion, key: string) {
    try {
      await api.createWidget({
        type: s.widget_type,
        title: s.title,
        config: s.config,
        from_suggestion: true,
      });
      setAddedKeys((prev) => ({ ...prev, [key]: true }));
    } catch {
      // ignore
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.topbar, { paddingTop: insets.top + 8 }]}>
        <Text style={[styles.title, { color: colors.text, fontFamily: serif }]}>
          Reflect
        </Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 16 }}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: true })
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                item.role === 'user'
                  ? { alignSelf: 'flex-end', backgroundColor: colors.accent }
                  : {
                      alignSelf: 'flex-start',
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      borderWidth: StyleSheet.hairlineWidth,
                    },
              ]}
            >
              <Text
                style={[
                  styles.bubbleText,
                  item.role === 'user'
                    ? { color: '#FFFFFF' }
                    : { color: colors.text, fontFamily: serif },
                ]}
              >
                {item.content}
              </Text>
            </View>
          )}
          ListFooterComponent={
            <>
              {sending ? (
                <View style={[styles.bubble, styles.typing, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <ActivityIndicator size="small" color={colors.textMuted} />
                </View>
              ) : null}
              {suggestions.length > 0 ? (
                <View style={styles.suggestWrap}>
                  <Text style={[styles.suggestLabel, { color: colors.textFaint }]}>
                    SUGGESTIONS
                  </Text>
                  {suggestions.map((s, i) => {
                    const key = `${s.kind}-${i}`;
                    if (s.kind === 'widget') {
                      const added = addedKeys[key];
                      return (
                        <View
                          key={key}
                          style={[
                            styles.suggestRow,
                            {
                              backgroundColor: colors.surface,
                              borderColor: colors.border,
                            },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.suggestTitle, { color: colors.text }]}>
                              {s.title}
                            </Text>
                            <Text style={[styles.suggestKind, { color: colors.textFaint }]}>
                              {s.widget_type} widget
                            </Text>
                          </View>
                          <Pressable
                            disabled={added}
                            onPress={() => addWidget(s, key)}
                            style={[
                              styles.addBtn,
                              {
                                backgroundColor: added
                                  ? colors.surfaceAlt
                                  : colors.accent,
                              },
                            ]}
                          >
                            <Ionicons
                              name={added ? 'checkmark' : 'add'}
                              size={16}
                              color={added ? colors.textMuted : '#FFFFFF'}
                            />
                            <Text
                              style={[
                                styles.addBtnText,
                                { color: added ? colors.textMuted : '#FFFFFF' },
                              ]}
                            >
                              {added ? 'Added' : 'Add'}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    }
                    return (
                      <View
                        key={key}
                        style={[
                          styles.suggestRow,
                          {
                            backgroundColor: colors.surface,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Ionicons
                          name="pricetag-outline"
                          size={16}
                          color={colors.textMuted}
                        />
                        <Text
                          style={[styles.suggestTitle, { color: colors.text, marginLeft: 8 }]}
                        >
                          Tag: {s.name}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </>
          }
        />
      )}

      <View
        style={[
          styles.inputBar,
          {
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + 8,
            backgroundColor: colors.bg,
          },
        ]}
      >
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.surfaceAlt, color: colors.text },
          ]}
          placeholder="Reply…"
          placeholderTextColor={colors.textFaint}
          value={input}
          onChangeText={setInput}
          multiline
          onSubmitEditing={submit}
        />
        <Pressable
          onPress={submit}
          disabled={sending || input.trim() === ''}
          style={[
            styles.sendBtn,
            {
              backgroundColor:
                input.trim() === '' ? colors.surfaceAlt : colors.accent,
            },
          ]}
        >
          <Ionicons
            name="arrow-up"
            size={20}
            color={input.trim() === '' ? colors.textFaint : '#FFFFFF'}
          />
        </Pressable>
      </View>
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
  title: { fontSize: 22, letterSpacing: -0.3 },
  bubble: {
    maxWidth: '82%',
    padding: 14,
    borderRadius: 18,
    marginBottom: 10,
  },
  typing: { alignSelf: 'flex-start', borderWidth: StyleSheet.hairlineWidth },
  bubbleText: { fontSize: 16, lineHeight: 23 },
  suggestWrap: { marginTop: 8 },
  suggestLabel: {
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: '600',
    marginBottom: 8,
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  suggestTitle: { fontSize: 15, fontWeight: '600' },
  suggestKind: { fontSize: 12, marginTop: 2 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  addBtnText: { fontSize: 13, fontWeight: '600' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 16,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

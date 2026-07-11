import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../lib/theme';
import type { WisdomCard as WisdomCardType, WisdomCardKind } from '../lib/types';
import { ActionRail, RailAction } from './ActionRail';

interface Props {
  card: WisdomCardType;
  height: number;
  resonatesActive: boolean;
  savedActive: boolean;
  onResonates: () => void;
  onSave: () => void;
  onDistill: () => void;
  onOpen: () => void;
  onSnooze: () => void;
}

const KIND_LABEL: Record<WisdomCardKind, string> = {
  highlight: 'Highlight',
  takeaway: 'Takeaway',
  quote: 'Quote',
  video: 'Video',
  photo_page: 'Book page',
  journal_flashback: 'From your journal',
};

/** Auto-shrink serif size so long passages still fit one screen. */
function textSize(len: number): { fontSize: number; lineHeight: number } {
  if (len < 90) return { fontSize: 30, lineHeight: 40 };
  if (len < 180) return { fontSize: 26, lineHeight: 35 };
  if (len < 320) return { fontSize: 22, lineHeight: 30 };
  if (len < 520) return { fontSize: 19, lineHeight: 27 };
  return { fontSize: 16, lineHeight: 24 };
}

export function WisdomCard({
  card,
  height,
  resonatesActive,
  savedActive,
  onResonates,
  onSave,
  onDistill,
  onOpen,
  onSnooze,
}: Props) {
  const { colors, serif } = useTheme();

  // Subtle per-kind tint over the ivory/charcoal base.
  const tint = useMemo(() => {
    switch (card.kind) {
      case 'quote':
      case 'takeaway':
        return colors.accentSoft;
      case 'journal_flashback':
        return colors.surfaceAlt;
      default:
        return colors.bg;
    }
  }, [card.kind, colors]);

  const { fontSize, lineHeight } = textSize(card.text.length);

  const actions: RailAction[] = [
    {
      key: 'resonates',
      icon: resonatesActive ? 'heart' : 'heart-outline',
      label: 'Resonates',
      active: resonatesActive,
      onPress: onResonates,
    },
    {
      key: 'save',
      icon: savedActive ? 'bookmark' : 'bookmark-outline',
      label: 'Save',
      active: savedActive,
      onPress: onSave,
    },
  ];
  if (card.item_id) {
    actions.push({
      key: 'distill',
      icon: 'sparkles-outline',
      label: 'Distill',
      onPress: onDistill,
    });
    actions.push({
      key: 'open',
      icon: 'arrow-forward',
      label: 'Open',
      onPress: onOpen,
    });
  }
  actions.push({
    key: 'snooze',
    icon: 'moon-outline',
    label: 'Snooze',
    onPress: onSnooze,
  });

  return (
    <View style={[styles.card, { height, backgroundColor: tint }]}>
      <View style={styles.content}>
        {card.due_for_review ? (
          <View style={[styles.badge, { backgroundColor: colors.accent }]}>
            <Ionicons name="time-outline" size={12} color="#FFFFFF" />
            <Text style={styles.badgeText}>Due for review</Text>
          </View>
        ) : null}

        <Text style={[styles.overline, { color: colors.textFaint }]}>
          {KIND_LABEL[card.kind]}
        </Text>

        {card.image_url ? (
          <Image
            source={{ uri: card.image_url }}
            style={[styles.image, { borderColor: colors.border }]}
            resizeMode="cover"
          />
        ) : null}

        <Text
          style={[
            styles.body,
            { color: colors.text, fontFamily: serif, fontSize, lineHeight },
          ]}
        >
          {card.text}
        </Text>

        <View style={styles.source}>
          <Text style={[styles.title, { color: colors.text }]}>
            {card.title}
          </Text>
          {card.subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {card.subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.railWrap}>
        <ActionRail actions={actions} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', flexDirection: 'row' },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 40,
    justifyContent: 'center',
  },
  railWrap: {
    width: 78,
    justifyContent: 'center',
    paddingRight: 12,
    paddingBottom: 24,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 20,
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  overline: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
    marginBottom: 16,
  },
  image: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: { letterSpacing: -0.3 },
  source: { marginTop: 28 },
  title: { fontSize: 15, fontWeight: '600' },
  subtitle: { fontSize: 13, marginTop: 2 },
});

// Types mirrored from docs/API.md — the binding backend contract.

export type UUID = string; // uuid v4
export type ISODate = string; // "2026-07-11"
export type ISODateTime = string; // RFC3339

export type KnowledgeSource = 'book' | 'youtube' | 'link' | 'note' | 'voice';
export type KnowledgeType = 'article' | 'video' | 'book' | 'tweet' | 'pdf' | 'note';

export interface KnowledgeItem {
  id: UUID;
  source: KnowledgeSource;
  type: KnowledgeType;
  title: string;
  author: string | null;
  url: string | null;
  thumbnail_url: string | null;
  summary: string | null;
  reading_time_min: number | null;
  captured_at: ISODateTime;
  tags: string[];
  highlights_count: number;
}

export type HighlightSourceKind = 'log' | 'photo' | 'ai';

export interface Highlight {
  id: UUID;
  knowledge_item_id: UUID;
  text: string;
  note: string | null;
  photo_url: string | null;
  source_kind: HighlightSourceKind;
  highlighted_at: ISODateTime;
}

export interface RelatedItem {
  id: UUID;
  title: string;
  source: KnowledgeSource;
  reason: string;
}

export interface ItemDetail extends KnowledgeItem {
  raw_content: string | null;
  highlights: Highlight[];
  related: RelatedItem[];
}

export interface HealthResponse {
  status: string;
  ai: boolean;
}

// ----- Profile -----
export type AiTone = 'warm' | 'coach' | 'neutral' | 'socratic';
export type NotifFrequency = 'off' | 'daily' | 'twice_daily' | 'weekly';

export interface Profile {
  display_name: string | null;
  ai_tone: AiTone;
  quiet_hours_start: number;
  quiet_hours_end: number;
  notif_frequency: NotifFrequency;
}

// ----- Journal -----
export interface JournalEntrySummary {
  id: UUID;
  entry_date: ISODate;
  mood: number | null;
  energy: number | null;
  preview: string;
}

export interface JournalEntry {
  id: UUID;
  entry_date: ISODate;
  body: string;
  mood: number | null;
  energy: number | null;
  updated_at: ISODateTime;
}

export interface ChatMessage {
  id: UUID;
  role: 'user' | 'assistant';
  content: string;
  created_at: ISODateTime;
}

export type WidgetType =
  | 'metric'
  | 'habit'
  | 'mood_chart'
  | 'reading_stats'
  | 'goal'
  | 'journal_streak'
  | 'topics'
  | 'quote_of_day';

export interface WidgetSuggestion {
  kind: 'widget';
  widget_type: WidgetType;
  title: string;
  config: Record<string, unknown>;
}

export interface TagSuggestion {
  kind: 'tag';
  name: string;
}

export type ChatSuggestion = WidgetSuggestion | TagSuggestion;

export interface ChatResponse {
  reply: ChatMessage;
  suggestions: ChatSuggestion[];
}

// ----- Capture -----
export interface BookCaptureResponse {
  item: KnowledgeItem;
  highlights: Highlight[];
}

export interface PhotoCaptureResponse {
  highlight: Highlight;
}

export interface ItemsResponse {
  items: KnowledgeItem[];
  total: number;
}

// ----- Wisdom -----
export type WisdomCardKind =
  | 'highlight'
  | 'takeaway'
  | 'quote'
  | 'video'
  | 'photo_page'
  | 'journal_flashback';

export type WisdomObjectType = 'highlight' | 'item';

export interface WisdomCard {
  card_id: string;
  kind: WisdomCardKind;
  title: string;
  subtitle: string;
  text: string;
  image_url: string | null;
  item_id: UUID | null;
  object_type: WisdomObjectType;
  object_id: UUID;
  due_for_review: boolean;
}

export interface WisdomFeedResponse {
  cards: WisdomCard[];
  next_cursor: string | null;
}

export type WisdomAction = 'resonates' | 'neutral' | 'faded' | 'snoozed' | 'save';

export interface WisdomFeedbackResponse {
  ok: boolean;
  next_review_at: ISODateTime | null;
}

export interface WisdomSearchResult {
  object_type: WisdomObjectType;
  object_id: UUID;
  title: string;
  text: string;
  score: number;
}

export interface WisdomSearchResponse {
  results: WisdomSearchResult[];
}

export interface WisdomDigestResponse {
  week_of: ISODate;
  summary: string;
  stats: { captured: number; reviewed: number; journal_days: number };
}

// ----- Tracker -----
export type WidgetSize = 'half' | 'full';

// Per-type server-computed data payloads.
export interface MetricData {
  value: number;
  label: string;
}
export interface HabitData {
  streak: number;
  week: boolean[];
}
export interface MoodPoint {
  date: ISODate;
  mood: number | null;
  energy: number | null;
}
export interface MoodChartData {
  points: MoodPoint[];
}
export interface ReadingStatsData {
  captured_this_week: number;
  by_source: { book: number; youtube: number; link: number; note: number };
}
export interface GoalData {
  current: number;
  target: number;
}
export interface JournalStreakData {
  streak: number;
  best: number;
}
export interface TopicsData {
  topics: { name: string; count: number }[];
}
export interface QuoteOfDayData {
  text: string;
  title: string;
  author: string | null;
}

export interface Widget {
  id: UUID;
  type: WidgetType;
  title: string;
  config: Record<string, unknown>;
  position: number;
  size: WidgetSize;
  is_ai_created: boolean;
  data: unknown; // narrowed per-type in renderers
}

export interface WidgetsResponse {
  widgets: Widget[];
}

export interface WidgetProposal {
  widget_type: WidgetType;
  title: string;
  config: Record<string, unknown>;
  reason: string;
}

export interface SuggestResponse {
  proposals: WidgetProposal[];
}

export interface InsightResponse {
  insight: string | null;
}

export interface OkResponse {
  ok: boolean;
}

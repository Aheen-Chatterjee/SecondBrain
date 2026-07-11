import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type {
  BookCaptureResponse,
  ChatMessage,
  ChatResponse,
  HealthResponse,
  Highlight,
  InsightResponse,
  ItemDetail,
  ItemsResponse,
  JournalEntry,
  JournalEntrySummary,
  KnowledgeItem,
  OkResponse,
  PhotoCaptureResponse,
  Profile,
  SuggestResponse,
  Widget,
  WidgetsResponse,
  WidgetSize,
  WidgetType,
  WisdomAction,
  WisdomFeedResponse,
  WisdomFeedbackResponse,
  WisdomObjectType,
  WisdomSearchResponse,
} from './types';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

// Key under which the literal "dev" token is stored when running without
// Supabase (backend AUTH_DEV_MODE accepts it).
export const DEV_TOKEN_KEY = 'sb.dev_token';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Resolve the bearer token: Supabase session token, else the dev token. */
export async function getAuthToken(): Promise<string | null> {
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }
  return AsyncStorage.getItem(DEV_TOKEN_KEY);
}

async function authHeader(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseError(res: Response): Promise<never> {
  let detail = res.statusText || `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as { detail?: string };
    if (body?.detail) detail = body.detail;
  } catch {
    // non-JSON body
  }
  throw new ApiError(res.status, detail);
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(await authHeader()),
    ...((options.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) return parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function jsonRequest<T>(
  path: string,
  method: string,
  body?: unknown
): Promise<T> {
  return request<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// --- generic verbs ---
const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  jsonRequest<T>(path, 'POST', body);
const put = <T>(path: string, body?: unknown) =>
  jsonRequest<T>(path, 'PUT', body);
const patch = <T>(path: string, body?: unknown) =>
  jsonRequest<T>(path, 'PATCH', body);
const del = <T>(path: string) => request<T>(path, { method: 'DELETE' });

// --- multipart (book page photo) ---
async function postMultipart<T>(path: string, form: FormData): Promise<T> {
  // NB: do NOT set Content-Type manually — the runtime adds the boundary.
  return request<T>(path, { method: 'POST', body: form as unknown as BodyInit });
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ''
  );
  if (entries.length === 0) return '';
  return (
    '?' +
    entries
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&')
  );
}

// ---------------------------------------------------------------------------
// Typed endpoint surface
// ---------------------------------------------------------------------------
export const api = {
  health: () => get<HealthResponse>('/health'),

  // Profile
  getProfile: () => get<Profile>('/api/profile'),
  updateProfile: (body: Partial<Profile>) => put<Profile>('/api/profile', body),
  registerPushToken: (expo_push_token: string) =>
    post<OkResponse>('/api/profile/push-token', { expo_push_token }),

  // Journal
  listJournalMonth: (year: number, month: number) =>
    get<{ entries: JournalEntrySummary[] }>(
      `/api/journal/entries${qs({ year, month })}`
    ),
  getJournalEntry: (entryDate: string) =>
    get<JournalEntry>(`/api/journal/entries/${entryDate}`),
  saveJournalEntry: (
    entryDate: string,
    body: { body: string; mood: number | null; energy: number | null }
  ) => put<JournalEntry>(`/api/journal/entries/${entryDate}`, body),
  getJournalChat: (entryId: string) =>
    get<{ messages: ChatMessage[] }>(`/api/journal/entries/${entryId}/chat`),
  postJournalChat: (entryId: string, message: string | null) =>
    post<ChatResponse>(`/api/journal/entries/${entryId}/chat`, { message }),
  onThisDay: () =>
    get<{ entries: JournalEntrySummary[] }>('/api/journal/on-this-day'),

  // Capture
  captureLink: (url: string, note: string | null) =>
    post<KnowledgeItem>('/api/capture/link', { url, note }),
  captureNote: (text: string) =>
    post<KnowledgeItem>('/api/capture/note', { text }),
  captureBook: (title: string, author: string | null, reflection: string | null) =>
    post<BookCaptureResponse>('/api/capture/book', { title, author, reflection }),
  captureBookPhoto: (itemId: string, form: FormData) =>
    postMultipart<PhotoCaptureResponse>(
      `/api/capture/book/${itemId}/photo`,
      form
    ),

  // Items
  listItems: (params: {
    source?: string;
    type?: string;
    tag?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }) => get<ItemsResponse>(`/api/items${qs(params)}`),
  getItem: (id: string) => get<ItemDetail>(`/api/items/${id}`),
  deleteItem: (id: string) => del<OkResponse>(`/api/items/${id}`),
  distillItem: (id: string) =>
    post<{ highlights: Highlight[] }>(`/api/items/${id}/distill`),

  // Wisdom
  wisdomFeed: (cursor: string | null, limit = 10) =>
    get<WisdomFeedResponse>(`/api/wisdom/feed${qs({ cursor, limit })}`),
  wisdomFeedback: (
    object_type: WisdomObjectType,
    object_id: string,
    action: WisdomAction
  ) =>
    post<WisdomFeedbackResponse>('/api/wisdom/feedback', {
      object_type,
      object_id,
      action,
    }),
  wisdomSearch: (q: string, limit = 20) =>
    get<WisdomSearchResponse>(`/api/wisdom/search${qs({ q, limit })}`),

  // Tracker
  listWidgets: () => get<WidgetsResponse>('/api/tracker/widgets'),
  createWidget: (body: {
    type: WidgetType;
    title: string;
    config?: Record<string, unknown>;
    size?: WidgetSize;
    from_suggestion?: boolean;
  }) => post<Widget>('/api/tracker/widgets', body),
  updateWidget: (
    id: string,
    body: Partial<{
      title: string;
      config: Record<string, unknown>;
      position: number;
      size: WidgetSize;
    }>
  ) => patch<Widget>(`/api/tracker/widgets/${id}`, body),
  deleteWidget: (id: string) => del<OkResponse>(`/api/tracker/widgets/${id}`),
  addWidgetData: (id: string, value: object, ts?: string) =>
    post<OkResponse>(`/api/tracker/widgets/${id}/data`, { value, ts }),
  suggestWidgets: () => post<SuggestResponse>('/api/tracker/suggest'),
  getInsight: () => get<InsightResponse>('/api/tracker/insight'),
};

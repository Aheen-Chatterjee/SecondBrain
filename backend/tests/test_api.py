import datetime as dt

import pytest

from tests.conftest import DEV_HEADERS

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["ai"] is False  # no OPENROUTER_API_KEY in test env


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------


async def test_profile_get_creates_default(client):
    resp = await client.get("/api/profile", headers=DEV_HEADERS)
    assert resp.status_code == 200
    body = resp.json()
    assert body["ai_tone"] == "warm"
    assert body["quiet_hours_start"] == 22
    assert body["quiet_hours_end"] == 8
    assert body["notif_frequency"] == "daily"


async def test_profile_requires_auth(client):
    resp = await client.get("/api/profile")
    assert resp.status_code == 401


async def test_profile_put_updates_fields(client):
    resp = await client.put(
        "/api/profile",
        headers=DEV_HEADERS,
        json={"display_name": "Aheen", "ai_tone": "coach"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["display_name"] == "Aheen"
    assert body["ai_tone"] == "coach"

    # unchanged fields persist
    resp2 = await client.get("/api/profile", headers=DEV_HEADERS)
    assert resp2.json()["display_name"] == "Aheen"


async def test_push_token(client):
    resp = await client.post(
        "/api/profile/push-token",
        headers=DEV_HEADERS,
        json={"expo_push_token": "ExponentPushToken[abc123]"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


# ---------------------------------------------------------------------------
# Journal
# ---------------------------------------------------------------------------


async def test_journal_upsert_get_and_month_list(client):
    entry_date = "2026-07-11"
    put_resp = await client.put(
        f"/api/journal/entries/{entry_date}",
        headers=DEV_HEADERS,
        json={"body": "Today was a good day for testing.", "mood": 4, "energy": 3},
    )
    assert put_resp.status_code == 200
    body = put_resp.json()
    assert body["entry_date"] == entry_date
    assert body["body"] == "Today was a good day for testing."
    assert body["mood"] == 4

    get_resp = await client.get(f"/api/journal/entries/{entry_date}", headers=DEV_HEADERS)
    assert get_resp.status_code == 200
    assert get_resp.json()["body"] == "Today was a good day for testing."

    # upsert again (autosave) updates in place, not a duplicate
    put_resp2 = await client.put(
        f"/api/journal/entries/{entry_date}",
        headers=DEV_HEADERS,
        json={"body": "Updated body.", "mood": 5, "energy": None},
    )
    assert put_resp2.status_code == 200
    assert put_resp2.json()["body"] == "Updated body."

    month_resp = await client.get("/api/journal/entries", headers=DEV_HEADERS, params={"year": 2026, "month": 7})
    assert month_resp.status_code == 200
    entries = month_resp.json()["entries"]
    assert any(e["entry_date"] == entry_date for e in entries)
    match = next(e for e in entries if e["entry_date"] == entry_date)
    assert match["preview"].startswith("Updated body.")


async def test_journal_get_missing_entry_404(client):
    resp = await client.get("/api/journal/entries/2020-01-01", headers=DEV_HEADERS)
    assert resp.status_code == 404


async def test_journal_chat_fallback(client):
    entry_date = "2026-07-05"
    put_resp = await client.put(
        f"/api/journal/entries/{entry_date}",
        headers=DEV_HEADERS,
        json={"body": "Reflecting on the week.", "mood": 3, "energy": 3},
    )
    entry_id = put_resp.json()["id"]

    chat_resp = await client.post(
        f"/api/journal/entries/{entry_id}/chat",
        headers=DEV_HEADERS,
        json={"message": None},
    )
    assert chat_resp.status_code == 200
    body = chat_resp.json()
    assert body["reply"]["role"] == "assistant"
    # deterministic fallback prompt per API.md AI degradation rules
    assert body["reply"]["content"] == "What felt most alive about today?"
    assert body["suggestions"] == []

    get_resp = await client.get(f"/api/journal/entries/{entry_id}/chat", headers=DEV_HEADERS)
    messages = get_resp.json()["messages"]
    assert len(messages) == 1  # only the assistant turn (no user message sent)
    assert messages[0]["role"] == "assistant"

    # a follow-up user message also persists both turns
    chat_resp2 = await client.post(
        f"/api/journal/entries/{entry_id}/chat",
        headers=DEV_HEADERS,
        json={"message": "I felt tired but okay."},
    )
    assert chat_resp2.status_code == 200
    get_resp2 = await client.get(f"/api/journal/entries/{entry_id}/chat", headers=DEV_HEADERS)
    messages2 = get_resp2.json()["messages"]
    assert len(messages2) == 3
    assert messages2[1]["role"] == "user"
    assert messages2[1]["content"] == "I felt tired but okay."
    assert messages2[2]["role"] == "assistant"


async def test_journal_on_this_day(client):
    resp = await client.get("/api/journal/on-this-day", headers=DEV_HEADERS)
    assert resp.status_code == 200
    assert "entries" in resp.json()


# ---------------------------------------------------------------------------
# Capture
# ---------------------------------------------------------------------------


async def test_capture_link_and_dedup(client):
    resp = await client.post(
        "/api/capture/link",
        headers=DEV_HEADERS,
        json={"url": "https://example.com/some-article", "note": None},
    )
    assert resp.status_code == 200
    item = resp.json()
    assert item["source"] == "link"
    assert item["type"] in ("article", "video", "tweet", "pdf")
    assert item["title"]  # falls back to URL/hostname when fetch is blocked in sandbox
    assert item["url"] == "https://example.com/some-article"
    item_id = item["id"]

    # re-capturing the same URL dedups and returns the existing item, 200
    resp2 = await client.post(
        "/api/capture/link",
        headers=DEV_HEADERS,
        json={"url": "https://example.com/some-article", "note": None},
    )
    assert resp2.status_code == 200
    assert resp2.json()["id"] == item_id


async def test_capture_note(client):
    resp = await client.post(
        "/api/capture/note",
        headers=DEV_HEADERS,
        json={"text": "Remember to drink more water. It matters."},
    )
    assert resp.status_code == 200
    item = resp.json()
    assert item["source"] == "note"
    assert item["type"] == "note"
    assert item["title"]


async def test_capture_note_empty_text_422(client):
    resp = await client.post("/api/capture/note", headers=DEV_HEADERS, json={"text": "   "})
    assert resp.status_code == 422


async def test_capture_book_with_reflection_split_fallback(client):
    reflection = (
        "The book argues that small habits compound over time. You do not rise to the level "
        "of your goals, you fall to the level of your systems.\n\n"
        "Identity change is the real driver of lasting habits, not outcome-based goals."
    )
    resp = await client.post(
        "/api/capture/book",
        headers=DEV_HEADERS,
        json={"title": "Atomic Habits", "author": "James Clear", "reflection": reflection},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["item"]["source"] == "book"
    assert body["item"]["type"] == "book"
    assert body["item"]["author"] == "James Clear"
    assert len(body["highlights"]) >= 2
    for h in body["highlights"]:
        assert h["source_kind"] == "ai"

    # re-logging the same title+author appends to the existing book item
    resp2 = await client.post(
        "/api/capture/book",
        headers=DEV_HEADERS,
        json={"title": "Atomic Habits", "author": "James Clear", "reflection": "One more thought worth keeping."},
    )
    assert resp2.status_code == 200
    assert resp2.json()["item"]["id"] == body["item"]["id"]

    # fetch the item and confirm highlights accrued
    item_id = body["item"]["id"]
    detail_resp = await client.get(f"/api/items/{item_id}", headers=DEV_HEADERS)
    assert detail_resp.status_code == 200
    assert detail_resp.json()["highlights_count"] >= 3


async def test_capture_book_photo_fallback_no_ai_key(client):
    book_resp = await client.post(
        "/api/capture/book",
        headers=DEV_HEADERS,
        json={"title": "Deep Work", "author": "Cal Newport", "reflection": None},
    )
    item_id = book_resp.json()["item"]["id"]

    files = {"photo": ("page.jpg", b"\xff\xd8\xff\xe0fake-jpeg-bytes", "image/jpeg")}
    resp = await client.post(f"/api/capture/book/{item_id}/photo", headers=DEV_HEADERS, files=files)
    assert resp.status_code == 200
    highlight = resp.json()["highlight"]
    assert highlight["source_kind"] == "photo"
    assert highlight["photo_url"] is None  # no Supabase storage configured
    assert "connect an AI key" in highlight["text"]


# ---------------------------------------------------------------------------
# Items
# ---------------------------------------------------------------------------


async def test_items_list_detail_delete(client):
    create_resp = await client.post(
        "/api/capture/note",
        headers=DEV_HEADERS,
        json={"text": "A throwaway note for item CRUD testing purposes."},
    )
    item_id = create_resp.json()["id"]

    list_resp = await client.get("/api/items", headers=DEV_HEADERS, params={"limit": 100})
    assert list_resp.status_code == 200
    list_body = list_resp.json()
    assert list_body["total"] >= 1
    assert any(i["id"] == item_id for i in list_body["items"])

    detail_resp = await client.get(f"/api/items/{item_id}", headers=DEV_HEADERS)
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["id"] == item_id
    assert "raw_content" in detail
    assert "highlights" in detail
    assert "related" in detail

    delete_resp = await client.delete(f"/api/items/{item_id}", headers=DEV_HEADERS)
    assert delete_resp.status_code == 200
    assert delete_resp.json() == {"ok": True}

    missing_resp = await client.get(f"/api/items/{item_id}", headers=DEV_HEADERS)
    assert missing_resp.status_code == 404


async def test_items_filter_by_source(client):
    await client.post("/api/capture/note", headers=DEV_HEADERS, json={"text": "Filter check note content."})
    resp = await client.get("/api/items", headers=DEV_HEADERS, params={"source": "note", "limit": 100})
    assert resp.status_code == 200
    for item in resp.json()["items"]:
        assert item["source"] == "note"


async def test_distill_fallback(client):
    create_resp = await client.post(
        "/api/capture/note",
        headers=DEV_HEADERS,
        json={
            "text": (
                "Compounding is powerful. Small consistent actions beat sporadic heroics. "
                "Systems matter more than goals. This is the third sentence for distillation."
            )
        },
    )
    item_id = create_resp.json()["id"]

    resp = await client.post(f"/api/items/{item_id}/distill", headers=DEV_HEADERS)
    assert resp.status_code == 200
    highlights = resp.json()["highlights"]
    assert 1 <= len(highlights) <= 5
    for h in highlights:
        assert h["source_kind"] == "ai"


# ---------------------------------------------------------------------------
# Wisdom
# ---------------------------------------------------------------------------


async def test_wisdom_feed_has_cards_after_capture(client):
    await client.post(
        "/api/capture/book",
        headers=DEV_HEADERS,
        json={
            "title": "Feed Test Book",
            "author": "Some Author",
            "reflection": "A short and memorable takeaway about focus and depth.",
        },
    )
    resp = await client.get("/api/wisdom/feed", headers=DEV_HEADERS, params={"limit": 10})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["cards"]) > 0
    card = body["cards"][0]
    assert card["object_type"] in ("highlight", "item")
    assert card["kind"] in ("highlight", "takeaway", "quote", "video", "photo_page", "journal_flashback")


async def test_wisdom_feed_pagination_cursor(client):
    for i in range(15):
        await client.post("/api/capture/note", headers=DEV_HEADERS, json={"text": f"Pagination note number {i}."})

    resp = await client.get("/api/wisdom/feed", headers=DEV_HEADERS, params={"limit": 5})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["cards"]) == 5
    assert body["next_cursor"] is not None

    resp2 = await client.get("/api/wisdom/feed", headers=DEV_HEADERS, params={"limit": 5, "cursor": body["next_cursor"]})
    assert resp2.status_code == 200
    body2 = resp2.json()
    first_ids = {c["card_id"] for c in body["cards"]}
    second_ids = {c["card_id"] for c in body2["cards"]}
    assert first_ids.isdisjoint(second_ids)


async def test_wisdom_feedback_updates_next_review_at(client):
    book_resp = await client.post(
        "/api/capture/book",
        headers=DEV_HEADERS,
        json={"title": "Feedback Test Book", "author": None, "reflection": "One clean takeaway sentence here."},
    )
    highlight = book_resp.json()["highlights"][0]

    resp = await client.post(
        "/api/wisdom/feedback",
        headers=DEV_HEADERS,
        json={"object_type": "highlight", "object_id": highlight["id"], "action": "resonates"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["next_review_at"] is not None
    first_next = dt.datetime.fromisoformat(body["next_review_at"].replace("Z", "+00:00"))

    # "resonates" should grow the interval further out than "faded" would
    resp2 = await client.post(
        "/api/wisdom/feedback",
        headers=DEV_HEADERS,
        json={"object_type": "highlight", "object_id": highlight["id"], "action": "faded"},
    )
    assert resp2.status_code == 200
    second_next = dt.datetime.fromisoformat(resp2.json()["next_review_at"].replace("Z", "+00:00"))
    assert second_next < first_next


async def test_wisdom_feedback_unknown_object_404(client):
    resp = await client.post(
        "/api/wisdom/feedback",
        headers=DEV_HEADERS,
        json={"object_type": "highlight", "object_id": "00000000-0000-0000-0000-000000000099", "action": "resonates"},
    )
    assert resp.status_code == 404


async def test_wisdom_search(client):
    await client.post(
        "/api/capture/note",
        headers=DEV_HEADERS,
        json={"text": "Zebrafish regeneration research is a fascinating unique topic."},
    )
    resp = await client.get("/api/wisdom/search", headers=DEV_HEADERS, params={"q": "zebrafish", "limit": 20})
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert len(results) >= 1
    assert any("zebrafish" in r["text"].lower() for r in results)
    assert all(0 <= r["score"] <= 1 for r in results)


async def test_wisdom_digest(client):
    resp = await client.get("/api/wisdom/digest", headers=DEV_HEADERS)
    assert resp.status_code == 200
    body = resp.json()
    assert "week_of" in body
    assert set(body["stats"].keys()) == {"captured", "reviewed", "journal_days"}


# ---------------------------------------------------------------------------
# Tracker
# ---------------------------------------------------------------------------


async def test_tracker_metric_widget_crud_and_data(client):
    create_resp = await client.post(
        "/api/tracker/widgets",
        headers=DEV_HEADERS,
        json={"type": "metric", "title": "Items captured", "config": {"metric": "items_captured", "label": "Items"}},
    )
    assert create_resp.status_code == 200
    widget = create_resp.json()
    assert widget["type"] == "metric"
    assert widget["is_ai_created"] is False
    assert widget["data"]["label"] == "Items"
    assert isinstance(widget["data"]["value"], int)
    widget_id = widget["id"]

    patch_resp = await client.patch(
        f"/api/tracker/widgets/{widget_id}", headers=DEV_HEADERS, json={"title": "Total items captured"}
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["title"] == "Total items captured"

    list_resp = await client.get("/api/tracker/widgets", headers=DEV_HEADERS)
    assert list_resp.status_code == 200
    assert any(w["id"] == widget_id for w in list_resp.json()["widgets"])

    delete_resp = await client.delete(f"/api/tracker/widgets/{widget_id}", headers=DEV_HEADERS)
    assert delete_resp.status_code == 200
    assert delete_resp.json() == {"ok": True}


async def test_tracker_habit_widget_data(client):
    create_resp = await client.post(
        "/api/tracker/widgets",
        headers=DEV_HEADERS,
        json={"type": "habit", "title": "Running", "config": {"name": "Running"}},
    )
    widget_id = create_resp.json()["id"]

    data_resp = await client.post(
        f"/api/tracker/widgets/{widget_id}/data", headers=DEV_HEADERS, json={"value": {"done": True}}
    )
    assert data_resp.status_code == 200
    assert data_resp.json() == {"ok": True}

    get_resp = await client.get("/api/tracker/widgets", headers=DEV_HEADERS)
    habit_widget = next(w for w in get_resp.json()["widgets"] if w["id"] == widget_id)
    assert habit_widget["data"]["streak"] >= 1
    assert len(habit_widget["data"]["week"]) == 7
    assert habit_widget["data"]["week"][-1] is True  # today marked done


async def test_tracker_journal_streak_widget(client):
    create_resp = await client.post(
        "/api/tracker/widgets", headers=DEV_HEADERS, json={"type": "journal_streak", "title": "Streak"}
    )
    widget_id = create_resp.json()["id"]

    today = dt.date.today().isoformat()
    await client.put(f"/api/journal/entries/{today}", headers=DEV_HEADERS, json={"body": "Streak entry today."})

    get_resp = await client.get("/api/tracker/widgets", headers=DEV_HEADERS)
    widget = next(w for w in get_resp.json()["widgets"] if w["id"] == widget_id)
    assert widget["data"]["streak"] >= 1
    assert widget["data"]["best"] >= widget["data"]["streak"]


async def test_tracker_quote_of_day_widget(client):
    await client.post(
        "/api/capture/book",
        headers=DEV_HEADERS,
        json={"title": "Quote Source Book", "author": "Q Author", "reflection": "A quotable single takeaway line."},
    )
    create_resp = await client.post(
        "/api/tracker/widgets", headers=DEV_HEADERS, json={"type": "quote_of_day", "title": "Quote"}
    )
    widget_id = create_resp.json()["id"]

    get_resp = await client.get("/api/tracker/widgets", headers=DEV_HEADERS)
    widget = next(w for w in get_resp.json()["widgets"] if w["id"] == widget_id)
    assert widget["data"]["text"] is not None
    assert widget["data"]["title"] is not None


async def test_tracker_suggest_empty_without_ai_key(client):
    resp = await client.post("/api/tracker/suggest", headers=DEV_HEADERS)
    assert resp.status_code == 200
    assert resp.json()["proposals"] == []


async def test_tracker_insight_null_without_ai_key(client):
    resp = await client.get("/api/tracker/insight", headers=DEV_HEADERS)
    assert resp.status_code == 200
    assert resp.json()["insight"] is None


# ---------------------------------------------------------------------------
# Integrations & notifications
# ---------------------------------------------------------------------------


async def test_integrations_youtube_connect_and_list(client):
    resp = await client.post(
        "/api/integrations/youtube",
        headers=DEV_HEADERS,
        json={"playlist_url": "https://www.youtube.com/playlist?list=PLabcdefghij1234567890"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["playlist_id"] == "PLabcdefghij1234567890"

    list_resp = await client.get("/api/integrations", headers=DEV_HEADERS)
    assert list_resp.status_code == 200
    integrations = list_resp.json()["integrations"]
    assert any(i["provider"] == "youtube" for i in integrations)


async def test_youtube_sync_no_api_key(client):
    resp = await client.post("/api/integrations/youtube/sync", headers=DEV_HEADERS)
    assert resp.status_code == 200
    assert resp.json() == {"imported": 0, "detail": "no api key"}


async def test_notifications_dispatch_trivial(client):
    resp = await client.post("/api/notifications/dispatch")
    assert resp.status_code == 200
    assert "sent" in resp.json()

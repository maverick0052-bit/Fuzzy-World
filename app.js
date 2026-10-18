import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Supabase publishable key is intended for browser use; RLS must protect all tables.
const SUPABASE_URL = "https://ifwuzipbpzihxbtgpbyt.supabase.co";
const SUPABASE_KEY = "sb_publishable_3Jh4eiETe8VJ0cWn7AwhtA_xrrxN-Rz";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (selector) => document.querySelector(selector);

const authPanel = $("#auth-panel");
const appShell = $("#app-shell");
const authForm = $("#auth-form");
const authStatus = $("#auth-status");
const dashboardStatus = $("#dashboard-status");
const moodStatus = $("#mood-status");
const authSubmit = $("#auth-submit");
let authMode = "login";
let currentUser = null;
let coupleId = null;
let members = [];
let selectedScore = null;
let realtimeChannel = null;
let loadingUserId = null;
let savingMood = false;
let moodRowsCache = [];
let moodCalendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedMoodDate = localDateKey(new Date());
let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedCalendarDate = new Date();

const moodLabels = {
  1: "Really difficult", 2: "Feeling very low", 3: "A little down",
  4: "Not feeling great", 5: "Just okay", 6: "Doing alright",
  7: "Feeling good", 8: "Really happy", 9: "Amazing", 10: "On top of the world"
};

// These are fixed, recurring dates, so the calendar costs nothing to run.
// Observances can vary by country; these are presented as fun reminders.
const specialDates = [
  { month: 0, day: 20, title: "Fattumi's Birthday", emoji: "🎂", kind: "birthday" },
  { month: 0, day: 25, title: "Barne", emoji: "💗", kind: "personal" },
  { month: 1, day: 7, title: "Rose Day", emoji: "🌹", kind: "love" },
  { month: 1, day: 8, title: "Propose Day", emoji: "💌", kind: "love" },
  { month: 1, day: 9, title: "Chocolate Day", emoji: "🍫", kind: "love" },
  { month: 1, day: 10, title: "Teddy Day", emoji: "🧸", kind: "love" },
  { month: 1, day: 11, title: "Promise Day", emoji: "🤞", kind: "love" },
  { month: 1, day: 12, title: "Hug Day", emoji: "🫂", kind: "love" },
  { month: 1, day: 13, title: "Kiss Day", emoji: "😘", kind: "love" },
  { month: 1, day: 14, title: "Valentine's Day · Love Day", emoji: "❤️", kind: "love" },
  { month: 4, day: 19, title: "Juzzy's Birthday", emoji: "🎂", kind: "birthday" },
  { month: 6, day: 17, title: "Nisbat", emoji: "💞", kind: "personal" },
  { month: 6, day: 21, title: "Our Anniversary", emoji: "💖", kind: "anniversary" },
  { month: 7, day: 1, title: "National Girlfriend Day", emoji: "🌷", kind: "love" },
  { month: 7, day: 18, title: "National Couple's Day", emoji: "💑", kind: "love" },
  { month: 9, day: 3, title: "National Boyfriend Day", emoji: "💐", kind: "love" }
];

function setStatus(node, message) { if (node) node.textContent = message || ""; }
function clear(node) { if (node) node.replaceChildren(); }
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function formatDate(value) {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(date) + " IST";
}
function timeAgo(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day(s) ago`;
  return formatDate(value);
}
function setAuthMode(mode) {
  authMode = mode;
  $("#login-tab").classList.toggle("active", mode === "login");
  $("#signup-tab").classList.toggle("active", mode === "signup");
  authSubmit.textContent = mode === "login" ? "Log in" : "Create account";
  $("#password").autocomplete = mode === "login" ? "current-password" : "new-password";
  setStatus(authStatus, "");
}
$("#login-tab").addEventListener("click", () => setAuthMode("login"));
$("#signup-tab").addEventListener("click", () => setAuthMode("signup"));

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("#email").value.trim();
  const password = $("#password").value;
  authSubmit.disabled = true;
  setStatus(authStatus, "Please wait…");
  try {
    if (authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: "https://maverick0052-bit.github.io/Fuzzy-World/" }
      });
      if (error) throw error;
      if (data.session) {
        setStatus(authStatus, "Account created. Opening your space…");
        await handleSession(data.session);
      } else {
        setStatus(authStatus, "Account created. Check your email to confirm it, then log in.");
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await handleSession(data.session);
    }
  } catch (error) {
    setStatus(authStatus, error.message || "Authentication failed.");
  } finally {
    authSubmit.disabled = false;
  }
});

function showLoggedOut() {
  if (realtimeChannel) { supabase.removeChannel(realtimeChannel); realtimeChannel = null; }
  currentUser = null; coupleId = null; members = []; selectedScore = null; loadingUserId = null; savingMood = false;
  authPanel.hidden = false; appShell.hidden = true;
  clear($("#mood-cards")); clear($("#mood-history")); moodRowsCache = [];
  activeQuestionDate = null; activeQuestionSetId = null; activeQuestionRows = []; activeQuestionAnswers = [];
  clear($("#my-questions-list")); clear($("#shared-answer-reveal")); clear($("#question-history-list"));
  $("#mood-note").value = ""; $("#save-mood").disabled = true;
  $("#mood-picker").querySelectorAll("button").forEach(button => {
    button.classList.remove("selected"); button.setAttribute("aria-pressed", "false");
  });
}

$("#logout-button").addEventListener("click", async () => {
  setStatus(dashboardStatus, "Logging out…");
  const { error } = await supabase.auth.signOut();
  if (error) setStatus(dashboardStatus, error.message);
  else { showLoggedOut(); setStatus(authStatus, "You have logged out."); }
});

function selectMood(score) {
  selectedScore = score;
  $("#mood-picker").querySelectorAll("button").forEach(button => {
    const active = Number(button.dataset.score) === score;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $("#selected-mood").textContent = `${score}/10 — ${moodLabels[score]}`;
  $("#save-mood").disabled = savingMood || !coupleId;
}
$("#mood-picker").addEventListener("click", event => {
  const button = event.target.closest("button[data-score]");
  if (button) selectMood(Number(button.dataset.score));
});

async function handleSession(session) {
  if (!session?.user) { showLoggedOut(); return; }
  const user = session.user;
  if (loadingUserId === user.id && currentUser?.id === user.id) return;
  if (realtimeChannel) { await supabase.removeChannel(realtimeChannel); realtimeChannel = null; }
  loadingUserId = user.id; currentUser = user; coupleId = null; members = [];
  authPanel.hidden = true; appShell.hidden = false;
  setStatus(dashboardStatus, "Connecting to your shared space…");
  clear($("#mood-cards")); clear($("#mood-history")); moodRowsCache = [];
  try {
    const { data: ownMembership, error: memberError } = await supabase
      .from("couple_members").select("couple_id, user_id, role").eq("user_id", user.id).maybeSingle();
    if (memberError) throw memberError;
    if (!ownMembership) {
      setStatus(dashboardStatus, "Your account is ready, but the shared space isn't linked to both accounts yet.");
      renderMoodCards([]); return;
    }
    coupleId = ownMembership.couple_id;
    const { data: memberRows, error: membersError } = await supabase
      .from("couple_members").select("couple_id, user_id, role").eq("couple_id", coupleId);
    if (membersError) throw membersError;
    members = memberRows || [];
    if (members.length !== 2) {
      setStatus(dashboardStatus, "Your shared space needs both partner accounts linked.");
      renderMoodCards([]); return;
    }
    const { data: couple, error: coupleError } = await supabase.from("couples").select("name").eq("id", coupleId).single();
    if (coupleError) throw coupleError;
    const brandName = couple?.name || "fuzzy world";
    document.querySelectorAll(".sidebar-brand-text,.mobile-topbar .brand span:last-child,.auth-brand span:last-child").forEach(node => node.textContent = brandName);
    subscribeToMoods(coupleId);
    await refreshMoods();
    if (!$("#page-questions").hidden) await loadQuestionDay(istDateKey(), true);
    if (currentUser?.id === user.id) setStatus(dashboardStatus, "Your shared space is connected ♡");
  } catch (error) {
    console.error("Dashboard initialization failed:", error);
    setStatus(dashboardStatus, "Couldn't load your shared space. Check your connection and database setup.");
  }
}

async function refreshMoods() {
  if (!currentUser || !coupleId) return;
  const expectedUserId = currentUser.id;
  const expectedCoupleId = coupleId;
  const allRows = []; const pageSize = 500; let offset = 0;
  while (true) {
    const { data, error } = await supabase.from("mood_updates")
      .select("id, user_id, score, note, created_at").eq("couple_id", expectedCoupleId)
      .order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
    if (error) { console.error("Mood refresh failed:", error); setStatus(dashboardStatus, "Couldn't refresh moods. Please retry."); return; }
    allRows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }
  if (currentUser?.id !== expectedUserId || coupleId !== expectedCoupleId) return;
  moodRowsCache = allRows; renderMoodCards(moodRowsCache); renderMoodHistory(moodRowsCache); renderMoodCalendar(); renderMoodDayDetail(selectedMoodDate);
}
function getPersonName(userId) {
  if (userId === currentUser?.id) return "You";
  return "Your person";
}
function latestPerPerson(rows) {
  const latest = new Map();
  for (const row of rows) if (!latest.has(row.user_id)) latest.set(row.user_id, row);
  return latest;
}
function renderMoodCards(rows) {
  const container = $("#mood-cards"); clear(container);
  const latest = latestPerPerson(rows);
  const sortedMembers = [...members].sort((a, b) => (a.role || "").localeCompare(b.role || ""));
  if (!sortedMembers.length) {
    container.append(el("p", "muted", "Your two mood cards will appear here once both accounts are linked."));
    return;
  }
  for (const member of sortedMembers) {
    const mood = latest.get(member.user_id);
    const card = el("article", "mood-card");
    card.append(el("p", "person", getPersonName(member.user_id)));
    if (!mood) {
      card.append(el("div", "mood-score", "—"), el("p", "description muted", "No mood shared yet"), el("p", "timestamp", "Waiting for the first check-in"));
    } else {
      card.append(el("div", "mood-score", `${mood.score}/10`), el("p", "description", moodLabels[mood.score]), el("p", "timestamp", `Last changed: ${formatDate(mood.created_at)}`), el("p", "timestamp", timeAgo(mood.created_at)));
      if (mood.note) card.append(el("p", "note", mood.note));
    }
    container.append(card);
  }
}
function renderMoodHistory(rows) {
  const container = $("#mood-history"); clear(container);
  const personFilter = $("#mood-history-person")?.value || "all";
  const search = ($("#mood-history-search")?.value || "").trim().toLowerCase();
  const filtered = rows.filter(mood => {
    const personMatch = personFilter === "all" || (personFilter === "me" ? mood.user_id === currentUser?.id : mood.user_id !== currentUser?.id);
    return personMatch && (!search || (mood.note || "").toLowerCase().includes(search));
  });
  const count = $("#mood-history-count");
  if (count) count.textContent = `${filtered.length} ${filtered.length === 1 ? "check-in" : "check-ins"} shown · newest first`;
  if (!filtered.length) { container.append(el("p", "muted", rows.length ? "No check-ins match these filters." : "No moods yet. Your first check-in starts your story ♡")); return; }
  for (const mood of filtered.slice(0, 100)) {
    const item = el("article", "history-item");
    const score = el("div", "history-score", mood.score);
    const main = el("div", "history-main");
    main.append(el("p", "history-person", `${getPersonName(mood.user_id)} · ${moodLabels[mood.score]}`), el("p", "timestamp", formatDate(mood.created_at)));
    if (mood.note) main.append(el("p", "note", mood.note));
    item.append(score, main); container.append(item);
  }
  if (filtered.length > 100) container.append(el("p", "muted small", "Showing the latest 100 matching check-ins."));
}
function moodRowsForDate(dateKey) {
  return moodRowsCache.filter(row => localDateKey(new Date(row.created_at)) === dateKey);
}
function renderMoodCalendar() {
  const heading = $("#mood-calendar-month"); const grid = $("#mood-calendar-days");
  if (!heading || !grid) return;
  const year = moodCalendarCursor.getFullYear(), month = moodCalendarCursor.getMonth();
  heading.textContent = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(moodCalendarCursor);
  clear(grid);
  const first = new Date(year, month, 1); const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  for (let i = 0; i < 42; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = localDateKey(date); const rows = moodRowsForDate(key);
    const button = el("button", "calendar-day mood-calendar-day", String(date.getDate()));
    if (date.getMonth() !== month) button.classList.add("outside");
    if (sameDay(date, new Date())) button.classList.add("today");
    if (rows.length) button.classList.add("has-mood");
    if (key === selectedMoodDate) button.classList.add("selected");
    button.setAttribute("aria-label", `${new Intl.DateTimeFormat("en-IN", { dateStyle: "full" }).format(date)}${rows.length ? `, ${rows.length} mood check-in(s)` : ", no mood check-ins"}`);
    if (rows.length) button.append(el("span", "mood-day-dot", "•"));
    button.addEventListener("click", () => { selectedMoodDate = key; if (date.getMonth() !== moodCalendarCursor.getMonth()) moodCalendarCursor = new Date(date.getFullYear(), date.getMonth(), 1); renderMoodCalendar(); renderMoodDayDetail(key); });
    grid.append(button);
  }
}
function renderMoodDayDetail(dateKey) {
  const box = $("#mood-day-detail"); if (!box) return; clear(box);
  const date = parseDateKey(dateKey); const rows = moodRowsForDate(dateKey);
  box.append(el("h3", "mood-detail-date", new Intl.DateTimeFormat("en-IN", { dateStyle: "full" }).format(date)));
  if (!rows.length) { box.append(el("p", "muted small", "No saved mood check-ins for this date. Every day is still part of your story ♡")); return; }
  for (const mood of rows) {
    const item = el("article", "mood-detail-item");
    item.append(el("span", "history-score mood-detail-score", String(mood.score)));
    const content = el("div", "mood-detail-content");
    content.append(el("p", "history-person", `${getPersonName(mood.user_id)} · ${moodLabels[mood.score]}`), el("p", "timestamp", formatDate(mood.created_at)));
    if (mood.note) content.append(el("p", "note", mood.note));
    item.append(content); box.append(item);
  }
}
$("#mood-calendar-prev")?.addEventListener("click", () => { moodCalendarCursor = new Date(moodCalendarCursor.getFullYear(), moodCalendarCursor.getMonth() - 1, 1); renderMoodCalendar(); });
$("#mood-calendar-next")?.addEventListener("click", () => { moodCalendarCursor = new Date(moodCalendarCursor.getFullYear(), moodCalendarCursor.getMonth() + 1, 1); renderMoodCalendar(); });
$("#mood-history-person")?.addEventListener("change", () => renderMoodHistory(moodRowsCache));
$("#mood-history-search")?.addEventListener("input", () => renderMoodHistory(moodRowsCache));
$("#mood-history-refresh")?.addEventListener("click", () => refreshMoods());

function subscribeToMoods(id) {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  realtimeChannel = supabase.channel(`moods-${id}`).on("postgres_changes", {
    event: "*", schema: "public", table: "mood_updates", filter: `couple_id=eq.${id}`
  }, () => refreshMoods()).subscribe(status => {
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setStatus(dashboardStatus, "Live updates disconnected. Refresh the page if needed.");
  });
}
$("#save-mood").addEventListener("click", async () => {
  if (!currentUser || !coupleId || selectedScore === null || savingMood) return;
  savingMood = true;
  const button = $("#save-mood"); button.disabled = true; button.textContent = "Saving…"; setStatus(moodStatus, "");
  try {
    const { error } = await supabase.from("mood_updates").insert({ couple_id: coupleId, user_id: currentUser.id, score: selectedScore, note: $("#mood-note").value.trim() || null });
    if (error) throw error;
    $("#mood-note").value = ""; setStatus(moodStatus, "Mood saved successfully ♡"); await refreshMoods();
  } catch (error) {
    console.error("Mood save failed:", error); setStatus(moodStatus, "Couldn't save your mood. Please try again.");
  } finally {
    savingMood = false; button.textContent = "Save my mood ♡"; button.disabled = selectedScore === null || !coupleId;
  }
});


// Stage 3: free daily Question Corner. Dates are always calculated in India Standard Time.
const dailyQuestionBank = [
  { prompt: "Which tiny thing makes you feel most loved?", options: ["A thoughtful message", "Quality time", "A warm hug", "Little acts of care"] },
  { prompt: "Our ideal slow day together would be…", options: ["A cosy movie day", "A long drive", "Trying a new café", "Staying in and talking"] },
  { prompt: "What kind of surprise would make you smile most?", options: ["A handwritten note", "A favourite snack", "A planned date", "A small meaningful gift"] },
  { prompt: "When you have a hard day, what helps most?", options: ["Being listened to", "A hug and comfort", "A little distraction", "Some quiet time, then a chat"] },
  { prompt: "Which memory would you happily relive?", options: ["Our first meeting", "A favourite date", "A silly moment", "A time we supported each other"] },
  { prompt: "Pick a perfect date-night vibe.", options: ["Dress up and go out", "Street food and a walk", "Games and laughter", "Candles and deep talks"] },
  { prompt: "Which message would brighten your day?", options: ["I miss you", "I'm proud of you", "Tell me everything", "I've got you"] },
  { prompt: "What's your favourite kind of affection?", options: ["Holding hands", "Long hugs", "Sweet words", "Thoughtful little actions"] },
  { prompt: "If we had a free weekend, we'd…", options: ["Explore somewhere new", "Have a home date", "Meet for food", "Make a spontaneous plan"] },
  { prompt: "What should we make more time for?", options: ["Deep conversations", "Fun dates", "Taking photos", "Resting together"] },
  { prompt: "Choose a couple tradition to start.", options: ["Monthly date day", "Goodnight voice notes", "A shared photo album", "Weekly check-in"] },
  { prompt: "Which little gift feels most personal?", options: ["A letter", "A playlist", "A photo keepsake", "Something I mentioned once"] },
  { prompt: "When we disagree, what matters most?", options: ["Listening without interrupting", "Taking a calm pause", "Being honest and gentle", "Finding a solution together"] },
  { prompt: "Which place sounds most romantic to you?", options: ["By the sea", "A quiet garden", "A cosy room", "A city at night"] },
  { prompt: "What would you like us to learn together?", options: ["Cooking something new", "A game or sport", "Photography or editing", "A language or skill"] },
  { prompt: "Which is the sweetest everyday ritual?", options: ["Morning check-in", "Sharing a song", "Goodnight message", "Asking how the day went"] },
  { prompt: "Pick our imaginary couple mascot.", options: ["Two sleepy cats", "Tiny teddy bears", "Two silly penguins", "A pair of lovebirds"] },
  { prompt: "What makes an apology feel sincere?", options: ["Taking responsibility", "Listening to my feelings", "Changing the behaviour", "A calm honest conversation"] },
  { prompt: "Which kind of memory should we collect more?", options: ["Everyday candid photos", "Screenshots of sweet chats", "Notes from dates", "Funny moments and inside jokes"] },
  { prompt: "What's the best way to celebrate a small win?", options: ["Cheering each other on", "A little treat", "A celebratory call", "Planning something fun"] },
  { prompt: "Choose a comfort combo.", options: ["Tea and a long chat", "Food and a show", "Music and a drive", "A hug and quiet time"] },
  { prompt: "What do you want more of in our future?", options: ["New adventures", "Peaceful routines", "Shared goals", "More time together"] },
  { prompt: "Which compliment stays with you longest?", options: ["You understand me", "You make me feel safe", "You inspire me", "You notice the little things"] },
  { prompt: "Pick a theme for our next date.", options: ["Childhood favourites", "Dress-up night", "No-phone time", "Surprise each other"] },
  { prompt: "When do you feel most connected to me?", options: ["When we laugh", "When we share honestly", "When we do ordinary things", "When we support each other"] },
  { prompt: "Which shared project sounds fun?", options: ["A bucket list", "A playlist together", "A scrapbook", "A recipe collection"] },
  { prompt: "What's a lovely way to reconnect after a busy day?", options: ["A quick voice note", "A proper catch-up", "A funny meme", "A little reassurance"] },
  { prompt: "Choose a tiny adventure.", options: ["Sunrise walk", "Late-night snack run", "Unplanned bus/train trip", "Find a new local spot"] },
  { prompt: "What should we protect in our relationship?", options: ["Trust", "Kindness during stress", "Time for each other", "Honest communication"] },
  { prompt: "Pick a future keepsake for us.", options: ["A jar of little notes", "A printed photo book", "A map of places visited", "A box of date memories"] }
];
const sharedWrittenBank = [
  "What's one small moment with me that made you feel genuinely cared for?",
  "What's something you'd love for us to experience together one day, and why?",
  "What's one thing I do that makes ordinary days feel special?",
  "Describe a memory of us that you hope we never forget.",
  "What's one way we can make each other feel more understood this week?",
  "If we could plan a perfect day together with no budget or time limits, what would it look like?",
  "What's something about our relationship that you're proud of?",
  "What's one little tradition you'd love us to start and keep for years?",
  "When do you feel safest being fully yourself with me?",
  "What's something new you'd like us to learn about each other?",
  "Write a tiny thank-you note for something I may not realise matters to you.",
  "Imagine us reading this answer a year from now. What do you hope we'll have done together?"
];
let activeQuestionDate = null;
let activeQuestionSetId = null;
let activeQuestionRows = [];
let activeQuestionAnswers = [];
let loadingQuestionDay = false;
let savingQuestionAnswers = false;

function istDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function stableHash(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
function seededShuffle(items, seed) {
  const result = [...items]; let state = seed >>> 0;
  for (let i = result.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1); [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function makeDailyQuestionPayload(dateKey) {
  const orderedMembers = [...members].sort((a, b) => a.user_id.localeCompare(b.user_id));
  const seed = stableHash(`${coupleId}:${dateKey}`);
  const picked = seededShuffle(dailyQuestionBank, seed).slice(0, 10);
  const payload = [];
  for (let slot = 1; slot <= 5; slot++) {
    const q = picked[slot - 1];
    payload.push({ slot_no: slot, audience_user_id: orderedMembers[0].user_id, question_type: "mcq", prompt: q.prompt, options: q.options });
    const other = picked[slot + 4];
    payload.push({ slot_no: slot, audience_user_id: orderedMembers[1].user_id, question_type: "mcq", prompt: other.prompt, options: other.options });
  }
  const written = seededShuffle(sharedWrittenBank, seed ^ 0x9e3779b9)[0];
  payload.push({ slot_no: 0, audience_user_id: null, question_type: "written", prompt: written, options: [] });
  return payload;
}
function ownQuestionRows(rows = activeQuestionRows) { return rows.filter(row => row.question_type === "mcq" && row.audience_user_id === currentUser?.id).sort((a,b) => a.slot_no - b.slot_no); }
function answerFor(questionId, userId = currentUser?.id, rows = activeQuestionAnswers) { return rows.find(row => row.question_id === questionId && row.user_id === userId); }
function otherMemberId() { return members.find(member => member.user_id !== currentUser?.id)?.user_id || null; }
function personLabel(userId) { return userId === currentUser?.id ? "You" : "Fattumi"; }

async function ensureQuestionSet(dateKey) {
  const { data: existing, error: findError } = await supabase.from("daily_question_sets").select("id, question_date").eq("couple_id", coupleId).eq("question_date", dateKey).maybeSingle();
  if (findError) throw findError;
  let set = existing;
  if (!set) {
    const { data: inserted, error: insertError } = await supabase.from("daily_question_sets").insert({ couple_id: coupleId, question_date: dateKey, created_by: currentUser.id }).select("id, question_date").single();
    if (insertError && insertError.code !== "23505") throw insertError;
    if (inserted) set = inserted;
    else {
      const { data: raced, error: racedError } = await supabase.from("daily_question_sets").select("id, question_date").eq("couple_id", coupleId).eq("question_date", dateKey).single();
      if (racedError) throw racedError;
      set = raced;
    }
  }
  const { data: existingQuestions, error: questionError } = await supabase.from("daily_questions").select("id, set_id, slot_no, audience_user_id, question_type, prompt, options").eq("set_id", set.id);
  if (questionError) throw questionError;
  if ((existingQuestions || []).length < 11) {
    const payload = makeDailyQuestionPayload(dateKey).map(question => ({ ...question, set_id: set.id }));
    const { error: seedError } = await supabase.from("daily_questions").upsert(payload, { onConflict: "set_id,slot_no,audience_user_id", ignoreDuplicates: true });
    if (seedError) throw seedError;
  }
  return set;
}

async function loadQuestionDay(dateKey = istDateKey(), allowCreate = true) {
  if (!currentUser || !coupleId || members.length !== 2 || loadingQuestionDay) return;
  loadingQuestionDay = true;
  activeQuestionDate = dateKey;
  setStatus($("#question-page-status"), "Loading your questions…");
  try {
    let set;
    if (allowCreate && dateKey === istDateKey()) set = await ensureQuestionSet(dateKey);
    else {
      const { data, error } = await supabase.from("daily_question_sets").select("id, question_date").eq("couple_id", coupleId).eq("question_date", dateKey).maybeSingle();
      if (error) throw error;
      set = data;
    }
    activeQuestionSetId = set?.id || null;
    activeQuestionRows = [];
    activeQuestionAnswers = [];
    if (set) {
      const { data: questionRows, error: qError } = await supabase.from("daily_questions").select("id, set_id, slot_no, audience_user_id, question_type, prompt, options").eq("set_id", set.id).order("slot_no", { ascending: true });
      if (qError) throw qError;
      activeQuestionRows = questionRows || [];
      const questionIds = activeQuestionRows.map(row => row.id);
      if (questionIds.length) {
        const { data: answers, error: aError } = await supabase.from("daily_answers").select("id, question_id, user_id, answer, updated_at").in("question_id", questionIds);
        if (aError) throw aError;
        activeQuestionAnswers = answers || [];
      }
    }
    renderQuestionDay();
    await refreshQuestionHistory(false);
    setStatus($("#question-page-status"), set ? "Your questions are saved for this day ♡" : "No saved questions for this day yet.");
  } catch (error) {
    console.error("Question Corner load failed:", error);
    setStatus($("#question-page-status"), "Couldn't load Question Corner. Please check the Stage 3 SQL setup and try Refresh.");
  } finally { loadingQuestionDay = false; }
}

function renderQuestionDay() {
  const dateTitle = activeQuestionDate ? new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeZone: "Asia/Kolkata" }).format(new Date(`${activeQuestionDate}T12:00:00+05:30`)) : "Today's questions";
  $("#question-date-title").textContent = dateTitle;
  const mine = ownQuestionRows();
  const isToday = activeQuestionDate === istDateKey();
  const partnerId = otherMemberId();
  $("#my-question-heading").textContent = isToday ? "Your side" : "Your answers from this day";
  const answered = mine.filter(q => !!answerFor(q.id)).length;
  $("#my-question-progress").textContent = `${answered} / 5 answered`;
  const list = $("#my-questions-list"); clear(list);
  if (!activeQuestionSetId || mine.length !== 5) {
    list.append(el("p", "muted", "This day has no saved challenge yet. Open today’s challenge to create it.") );
  } else {
    mine.forEach((question, index) => {
      const card = el("article", "question-card");
      card.append(el("p", "question-number", `Question ${index + 1} · ${answerFor(question.id) ? "Answered" : "Waiting for you"} `));
      card.append(el("h3", "", question.prompt));
      const options = el("div", "question-options");
      const saved = answerFor(question.id);
      (question.options || []).forEach(option => {
        const label = el("label", "question-option");
        const input = document.createElement("input"); input.type = "radio"; input.name = `q-${question.id}`; input.value = option; input.checked = saved?.answer === option; input.disabled = !isToday || !!saved;
        label.append(input, el("span", "", option)); options.append(label);
      });
      card.append(options);
      if (!isToday) card.append(el("p", "question-locked", "Past-day answers are read-only."));
      if (saved && partnerId) {
        const partnerQuestion = activeQuestionRows.find(row => row.question_type === "mcq" && row.audience_user_id === partnerId && row.slot_no === question.slot_no);
        const partnerAnswer = partnerQuestion ? answerFor(partnerQuestion.id, partnerId) : null;
        const reveal = el("div", "answer-reveal");
        if (partnerAnswer) { const bubble = el("div", "answer-bubble"); bubble.append(el("strong", "", "Your person's answer ♡"), el("p", "", partnerAnswer.answer)); reveal.append(bubble); }
        else reveal.append(el("p", "answer-waiting", "Your answer is saved. Your person's answer will appear here after they answer this question. ♡"));
        card.append(reveal);
      }
      list.append(card);
    });
  }
  $("#save-my-answers").hidden = !isToday;
  $("#save-my-answers").disabled = savingQuestionAnswers || !mine.some(q => !answerFor(q.id));
  const written = activeQuestionRows.find(row => row.question_type === "written");
  $("#shared-question-prompt").textContent = written?.prompt || "No written question saved for this day.";
  const ownWrittenAnswer = written ? answerFor(written.id) : null;
  $("#shared-answer-input").value = ownWrittenAnswer?.answer || "";
  $("#shared-answer-input").disabled = !isToday || !!ownWrittenAnswer || !written;
  $("#save-shared-answer").hidden = !isToday;
  $("#save-shared-answer").disabled = savingQuestionAnswers || !written || !!ownWrittenAnswer;
  renderSharedAnswerReveal(written, partnerId);
  if (ownWrittenAnswer) setStatus($("#shared-question-status"), "Your written answer is saved ♡");
  else setStatus($("#shared-question-status"), "");
  setStatus($("#my-question-status"), "");
}
function renderSharedAnswerReveal(written, partnerId) {
  const box = $("#shared-answer-reveal"); clear(box);
  if (!written) return;
  const own = answerFor(written.id);
  const partner = partnerId ? answerFor(written.id, partnerId) : null;
  if (own) { const bubble = el("div", "answer-bubble"); bubble.append(el("strong", "", "Your answer ♡"), el("p", "", own.answer)); box.append(bubble); }
  if (partner && own) { const bubble = el("div", "answer-bubble"); bubble.append(el("strong", "", "Your person's answer ♡"), el("p", "", partner.answer)); box.append(bubble); }
  else if (own && !partner) box.append(el("p", "answer-waiting", "Your answer is saved privately. You'll both see each other's written answers here after your person has answered too. ♡"));
  else if (!own) box.append(el("p", "answer-waiting", "Your answer stays private until both of you have answered this shared question."));
}

async function saveQuestionAnswer(questionId, answer) {
  const { error } = await supabase.from("daily_answers").upsert({ question_id: questionId, user_id: currentUser.id, answer, updated_at: new Date().toISOString() }, { onConflict: "question_id,user_id" });
  if (error) throw error;
}
$("#save-my-answers").addEventListener("click", async () => {
  if (savingQuestionAnswers || activeQuestionDate !== istDateKey()) return;
  savingQuestionAnswers = true; const button = $("#save-my-answers"); button.disabled = true; button.textContent = "Saving your answers…";
  try {
    const mine = ownQuestionRows();
    for (const question of mine) {
      if (answerFor(question.id)) continue;
      const checked = document.querySelector(`input[name="q-${question.id}"]:checked`);
      if (checked) await saveQuestionAnswer(question.id, checked.value);
    }
    setStatus($("#my-question-status"), "Your answers are saved ♡");
    await loadQuestionDay(istDateKey(), false);
  } catch (error) { console.error(error); setStatus($("#my-question-status"), "Couldn't save all answers. Please try again."); }
  finally { savingQuestionAnswers = false; button.textContent = "Save my answers ♡"; button.disabled = !ownQuestionRows().some(q => !answerFor(q.id)); }
});
$("#save-shared-answer").addEventListener("click", async () => {
  if (savingQuestionAnswers || activeQuestionDate !== istDateKey()) return;
  const written = activeQuestionRows.find(row => row.question_type === "written");
  const answer = $("#shared-answer-input").value.trim();
  if (!written || !answer) { setStatus($("#shared-question-status"), "Write a little answer before saving ♡"); return; }
  savingQuestionAnswers = true; $("#save-shared-answer").disabled = true;
  try { await saveQuestionAnswer(written.id, answer); setStatus($("#shared-question-status"), "Your answer is saved privately ♡"); await loadQuestionDay(istDateKey(), false); }
  catch (error) { console.error(error); setStatus($("#shared-question-status"), "Couldn't save your answer. Please try again."); }
  finally { savingQuestionAnswers = false; }
});

async function refreshQuestionHistory(showStatus = true) {
  if (!currentUser || !coupleId) return;
  const list = $("#question-history-list");
  if (showStatus) setStatus($("#question-page-status"), "Refreshing saved days…");
  try {
    const { data, error } = await supabase.from("daily_question_sets").select("id, question_date").eq("couple_id", coupleId).order("question_date", { ascending: false }).limit(90);
    if (error) throw error;
    clear(list);
    const rows = data || [];
    if (!rows.length) { list.append(el("p", "muted small", "Your saved question days will appear here.")); return; }
    rows.forEach(set => {
      const button = el("button", `question-history-day${set.question_date === activeQuestionDate ? " active" : ""}`, new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(`${set.question_date}T12:00:00+05:30`)));
      button.type = "button"; button.addEventListener("click", () => loadQuestionDay(set.question_date, false)); list.append(button);
    });
  } catch (error) { console.error("Question history failed:", error); if (showStatus) setStatus($("#question-page-status"), "Couldn't load question history. Check the Stage 3 SQL setup."); }
}
$("#question-history-refresh").addEventListener("click", () => refreshQuestionHistory(true));


// Sidebar navigation and mobile drawer.
function navigate(page) {
  document.querySelectorAll(".app-page").forEach(section => {
    const active = section.id === `page-${page}`;
    section.hidden = !active; section.classList.toggle("active-page", active);
  });
  document.querySelectorAll(".nav-item[data-page]").forEach(button => button.classList.toggle("active", button.dataset.page === page));
  document.title = `${document.querySelector(`#page-${page}`)?.dataset.title || "Fuzzy World"} · Fuzzy World ♡`;
  closeMobileMenu();
  if (page === "moods") { refreshMoods(); renderMoodCalendar(); renderMoodDayDetail(selectedMoodDate); }
  if (page === "questions" && currentUser && coupleId) loadQuestionDay(istDateKey(), true);
  window.scrollTo({ top: 0, behavior: "smooth" });
}
document.querySelectorAll(".nav-item[data-page]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.page)));
const sidebar = $("#sidebar");
const mainContent = $(".main-content");
$("#sidebar-collapse").addEventListener("click", () => {
  sidebar.classList.toggle("collapsed"); mainContent.classList.toggle("sidebar-is-collapsed");
});
$("#mobile-menu").addEventListener("click", () => {
  sidebar.classList.add("mobile-open"); $("#mobile-backdrop").hidden = false; $("#mobile-backdrop").classList.add("visible");
});
function closeMobileMenu() {
  sidebar.classList.remove("mobile-open"); $("#mobile-backdrop").hidden = true; $("#mobile-backdrop").classList.remove("visible");
}
$("#mobile-backdrop").addEventListener("click", closeMobileMenu);

// Relationship counter and the free, recurring special-date calendar.
function updateRelationshipCounter() {
  const start = new Date(2023, 6, 21);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const elapsed = Math.max(0, Math.floor((today - start) / 86400000));
  const years = today.getFullYear() - start.getFullYear() - ((today.getMonth() < start.getMonth() || (today.getMonth() === start.getMonth() && today.getDate() < start.getDate())) ? 1 : 0);
  const lastAnniversary = new Date(start.getFullYear() + years, start.getMonth(), start.getDate());
  const daysSinceAnniversary = Math.floor((today - lastAnniversary) / 86400000);
  $("#relationship-count").textContent = `${elapsed.toLocaleString("en-IN")} days together`;
  $("#relationship-subtitle").textContent = `${years} ${years === 1 ? "year" : "years"} and ${daysSinceAnniversary} days of us — and counting. ♡`;
  $("#today-label").textContent = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" }).format(today);
}
function eventsForDate(date) {
  const events = specialDates.filter(event => event.month === date.getMonth() && event.day === date.getDate()).map(event => ({ ...event }));
  if (date.getMonth() === 6 && date.getDate() === 21) {
    const years = date.getFullYear() - 2023;
    const anniversary = events.find(event => event.kind === "anniversary");
    if (anniversary) anniversary.title = `${years}${years === 1 ? "st" : years === 2 ? "nd" : years === 3 ? "rd" : "th"} Relationship Anniversary`;
  }
  return events;
}
function renderSelectedDateEvents(date) {
  const box = $("#selected-date-events"); clear(box);
  const events = eventsForDate(date);
  const heading = el("p", "selected-date-heading", new Intl.DateTimeFormat("en-IN", { dateStyle: "full" }).format(date));
  box.append(heading);
  if (!events.length) { box.append(el("p", "muted small", "No special date saved for this day — a lovely day anyway. ♡")); return; }
  for (const event of events) {
    const row = el("div", "event-line"); row.append(el("span", "event-emoji", event.emoji), el("span", "", event.title)); box.append(row);
  }
}
function renderCalendar() {
  const year = calendarCursor.getFullYear(); const month = calendarCursor.getMonth();
  $("#calendar-month").textContent = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(calendarCursor);
  const grid = $("#calendar-days"); clear(grid);
  const first = new Date(year, month, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - mondayOffset);
  for (let i = 0; i < 42; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const events = eventsForDate(date);
    const button = el("button", "calendar-day", String(date.getDate()));
    if (date.getMonth() !== month) button.classList.add("outside");
    if (sameDay(date, new Date())) button.classList.add("today");
    if (events.length) button.classList.add("has-event");
    if (sameDay(date, selectedCalendarDate)) button.classList.add("selected");
    button.setAttribute("aria-label", `${new Intl.DateTimeFormat("en-IN", { dateStyle: "full" }).format(date)}${events.length ? `: ${events.map(event => event.title).join(", ")}` : ""}`);
    button.addEventListener("click", () => { selectedCalendarDate = date; if (date.getMonth() !== calendarCursor.getMonth()) calendarCursor = new Date(date.getFullYear(), date.getMonth(), 1); renderCalendar(); renderSelectedDateEvents(selectedCalendarDate); });
    grid.append(button);
  }
  const legend = $("#calendar-legend"); clear(legend);
  [["💗", "Our dates"], ["🎂", "Birthdays"], ["❤️", "Love days"]].forEach(([emoji, label]) => {
    const span = el("span", "", `${emoji} ${label}`); legend.append(span);
  });
  renderSelectedDateEvents(selectedCalendarDate);
}
$("#calendar-prev").addEventListener("click", () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1); renderCalendar(); });
$("#calendar-next").addEventListener("click", () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1); renderCalendar(); });
updateRelationshipCounter(); renderCalendar(); renderMoodCalendar(); renderMoodDayDetail(selectedMoodDate);

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) { showLoggedOut(); return; }
  if (["SIGNED_IN", "INITIAL_SESSION", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)) setTimeout(() => handleSession(session), 0);
});
const { data: { session } } = await supabase.auth.getSession();
if (session) await handleSession(session); else showLoggedOut();

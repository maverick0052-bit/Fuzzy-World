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
  clear($("#mood-cards")); clear($("#mood-history"));
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
  clear($("#mood-cards")); clear($("#mood-history"));
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
  const { data, error } = await supabase.from("mood_updates")
    .select("id, user_id, score, note, created_at").eq("couple_id", expectedCoupleId)
    .order("created_at", { ascending: false }).limit(100);
  if (error) { console.error("Mood refresh failed:", error); setStatus(dashboardStatus, "Couldn't refresh moods. Please retry."); return; }
  if (currentUser?.id !== expectedUserId || coupleId !== expectedCoupleId) return;
  renderMoodCards(data || []); renderMoodHistory(data || []);
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
  if (!rows.length) { container.append(el("p", "muted", "No moods yet. Your first check-in starts your story ♡")); return; }
  for (const mood of rows.slice(0, 50)) {
    const item = el("article", "history-item");
    const score = el("div", "history-score", mood.score);
    const main = el("div", "history-main");
    main.append(el("p", "", `${getPersonName(mood.user_id)} · ${moodLabels[mood.score]}`), el("p", "timestamp", formatDate(mood.created_at)));
    if (mood.note) main.append(el("p", "note", mood.note));
    item.append(score, main); container.append(item);
  }
}
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

// Sidebar navigation and mobile drawer.
function navigate(page) {
  document.querySelectorAll(".app-page").forEach(section => {
    const active = section.id === `page-${page}`;
    section.hidden = !active; section.classList.toggle("active-page", active);
  });
  document.querySelectorAll(".nav-item[data-page]").forEach(button => button.classList.toggle("active", button.dataset.page === page));
  document.title = `${document.querySelector(`#page-${page}`)?.dataset.title || "Fuzzy World"} · Fuzzy World ♡`;
  closeMobileMenu();
  if (page === "moods") refreshMoods();
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
updateRelationshipCounter(); renderCalendar();

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) { showLoggedOut(); return; }
  if (["SIGNED_IN", "INITIAL_SESSION", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)) setTimeout(() => handleSession(session), 0);
});
const { data: { session } } = await supabase.auth.getSession();
if (session) await handleSession(session); else showLoggedOut();

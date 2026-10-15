import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// These are browser-safe Supabase project settings. Never put a service_role/secret key here.
const SUPABASE_URL = "https://ifwuzipbpzihxbtgpbyt.supabase.co";
const SUPABASE_KEY = "sb_publishable_3Jh4eiETe8VJ0cWn7AwhtA_xrrxN-Rz";
const SITE_URL = "https://maverick0052-bit.github.io/Fuzzy-World/";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (selector) => document.querySelector(selector);

const authPanel = $("#auth-panel");
const dashboard = $("#dashboard");
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
let moodRows = [];
let currentMonth = monthStart(new Date());
let selectedDateKey = todayKeyIST();

const moodLabels = {
  1: "Really difficult", 2: "Feeling very low", 3: "A little down",
  4: "Not feeling great", 5: "Just okay", 6: "Doing alright",
  7: "Feeling good", 8: "Really happy", 9: "Amazing",
  10: "On top of the world"
};

function setStatus(node, message) {
  node.textContent = message;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function clearChildren(node) {
  node.replaceChildren();
}

function formatDate(value) {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata"
  }).format(date) + " IST";
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

function dateKeyIST(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const part = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${part.year}-${part.month}-${part.day}`;
}

function todayKeyIST() {
  return dateKeyIST(new Date());
}

function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function keyFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDayLabel(key) {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  }).format(dateFromKey(key));
}

function showLoggedOut() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  currentUser = null;
  coupleId = null;
  members = [];
  moodRows = [];
  selectedScore = null;
  loadingUserId = null;
  savingMood = false;
  authPanel.hidden = false;
  dashboard.hidden = true;
  $("#mood-cards").replaceChildren();
  $("#mood-history").replaceChildren();
  $("#selected-day-moods").replaceChildren();
  $("#mood-note").value = "";
  $("#save-mood").disabled = true;
  $("#mood-picker").querySelectorAll("button").forEach(button => {
    button.classList.remove("selected");
    button.setAttribute("aria-pressed", "false");
  });
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
        email,
        password,
        options: { emailRedirectTo: SITE_URL }
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

$("#logout-button").addEventListener("click", async () => {
  setStatus(dashboardStatus, "Logging out…");
  const { error } = await supabase.auth.signOut();
  if (error) {
    setStatus(dashboardStatus, error.message);
  } else {
    showLoggedOut();
    setStatus(authStatus, "You have logged out.");
  }
});

function selectMood(score) {
  selectedScore = score;
  $("#mood-picker").querySelectorAll("button").forEach(button => {
    const active = Number(button.dataset.score) === score;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $("#selected-mood").textContent = `${score}/10 — ${moodLabels[score]}`;
  $("#save-mood").disabled = savingMood;
}

$("#mood-picker").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-score]");
  if (button) selectMood(Number(button.dataset.score));
});

async function handleSession(session) {
  if (!session?.user) {
    showLoggedOut();
    return;
  }
  const user = session.user;
  if (loadingUserId === user.id && currentUser?.id === user.id) return;

  if (realtimeChannel) {
    await supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  loadingUserId = user.id;
  currentUser = user;
  coupleId = null;
  members = [];
  moodRows = [];
  authPanel.hidden = true;
  dashboard.hidden = false;
  setStatus(dashboardStatus, "Connecting to your shared space…");
  clearChildren($("#mood-cards"));
  clearChildren($("#mood-history"));

  try {
    const { data: ownMembership, error: memberError } = await supabase
      .from("couple_members")
      .select("couple_id, user_id, role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (memberError) throw memberError;

    if (!ownMembership) {
      setStatus(dashboardStatus, "Your account is ready, but it isn't linked to your shared space yet.");
      return;
    }

    coupleId = ownMembership.couple_id;
    const { data: memberRows, error: membersError } = await supabase
      .from("couple_members")
      .select("couple_id, user_id, role")
      .eq("couple_id", coupleId);
    if (membersError) throw membersError;

    members = memberRows || [];
    if (members.length !== 2) {
      setStatus(dashboardStatus, "Your shared space needs both partner accounts linked.");
      return;
    }

    const { data: couple, error: coupleError } = await supabase
      .from("couples").select("name").eq("id", coupleId).single();
    if (coupleError) throw coupleError;

    $(".brand span:last-child").textContent = couple.name || "our little world";
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

  const { data, error } = await supabase
    .from("mood_updates")
    .select("id, couple_id, user_id, score, note, created_at")
    .eq("couple_id", expectedCoupleId)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("Mood refresh failed:", error);
    setStatus(dashboardStatus, "Couldn't refresh moods. Please retry.");
    return;
  }
  if (currentUser?.id !== expectedUserId || coupleId !== expectedCoupleId) return;

  moodRows = data || [];
  renderMoodCards(moodRows);
  renderMoodHistory(moodRows);
  renderCalendar();
}

function getPersonName(userId) {
  if (userId === currentUser?.id) return "You";
  const member = members.find(item => item.user_id === userId);
  if (member?.role === "partner_1") return "Partner 1";
  if (member?.role === "partner_2") return "Partner 2";
  return "Your partner";
}

function latestPerPerson(rows) {
  const latest = new Map();
  for (const row of rows) if (!latest.has(row.user_id)) latest.set(row.user_id, row);
  return latest;
}

function renderMoodCards(rows) {
  const container = $("#mood-cards");
  clearChildren(container);
  const latest = latestPerPerson(rows);
  const sortedMembers = [...members].sort((a, b) => a.role.localeCompare(b.role));

  for (const member of sortedMembers) {
    const mood = latest.get(member.user_id);
    const card = element("article", "mood-card");
    card.append(element("p", "person", getPersonName(member.user_id)));
    if (!mood) {
      card.append(
        element("div", "mood-score", "—"),
        element("p", "description muted", "No mood shared yet"),
        element("p", "timestamp", "Waiting for the first check-in")
      );
    } else {
      card.append(
        element("div", "mood-score", `${mood.score}/10`),
        element("p", "description", moodLabels[mood.score]),
        element("p", "timestamp", `Last changed: ${formatDate(mood.created_at)}`),
        element("p", "timestamp", timeAgo(mood.created_at))
      );
      if (mood.note) card.append(element("p", "note", mood.note));
    }
    container.append(card);
  }
}

function renderMoodHistory(rows) {
  const container = $("#mood-history");
  clearChildren(container);
  if (!rows.length) {
    container.append(element("p", "muted", "No moods yet. Your first check-in starts your story ♡"));
    return;
  }
  for (const mood of rows) {
    const item = element("article", "history-item");
    const score = element("div", "history-score", mood.score);
    const main = element("div", "history-main");
    main.append(
      element("p", "", `${getPersonName(mood.user_id)} · ${moodLabels[mood.score]}`),
      element("p", "timestamp", formatDate(mood.created_at))
    );
    if (mood.note) main.append(element("p", "note", mood.note));
    item.append(score, main);
    container.append(item);
  }
}

function renderCalendar() {
  const grid = $("#calendar-grid");
  clearChildren(grid);

  $("#calendar-month-label").textContent = new Intl.DateTimeFormat("en-IN", {
    month: "long", year: "numeric"
  }).format(currentMonth);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1, 12);
  const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
  const leadingBlanks = (firstDay.getDay() + 6) % 7;

  for (let i = 0; i < leadingBlanks; i++) {
    grid.append(element("span", "calendar-empty"));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day, 12);
    const key = keyFromDate(date);
    const entries = moodRows.filter(row => dateKeyIST(row.created_at) === key);
    const uniquePeople = new Set(entries.map(row => row.user_id));
    const button = element("button", "calendar-day");
    button.type = "button";
    button.dataset.date = key;
    button.setAttribute("aria-label", `${formatDayLabel(key)}${entries.length ? `, ${entries.length} mood entries` : ", no mood entries"}`);
    if (key === selectedDateKey) button.classList.add("selected");
    if (key === todayKeyIST()) button.classList.add("today");
    if (entries.length) button.classList.add("has-moods");
    if (uniquePeople.size > 1) button.classList.add("has-both");

    button.append(element("span", "calendar-day-number", String(day)));
    if (entries.length) button.append(element("span", "calendar-day-dot"));
    button.addEventListener("click", () => {
      selectedDateKey = key;
      renderCalendar();
    });
    grid.append(button);
  }

  const totalCells = leadingBlanks + daysInMonth;
  const trailingBlanks = (7 - (totalCells % 7)) % 7;
  for (let i = 0; i < trailingBlanks; i++) grid.append(element("span", "calendar-empty"));

  renderSelectedDay();
}

function renderSelectedDay() {
  const container = $("#selected-day-moods");
  clearChildren(container);
  $("#selected-day-label").textContent = formatDayLabel(selectedDateKey);
  const entries = moodRows.filter(row => dateKeyIST(row.created_at) === selectedDateKey);
  $("#selected-day-count").textContent = `${entries.length} ${entries.length === 1 ? "check-in" : "check-ins"}`;

  if (!entries.length) {
    container.append(element("p", "muted small", "No moods were saved on this day. Every day is a fresh page ♡"));
    return;
  }

  for (const mood of entries) {
    const item = element("article", "day-mood-item");
    item.append(element("div", "day-mood-score", `${mood.score}/10`));
    const details = element("div", "day-mood-details");
    details.append(
      element("p", "day-mood-person", `${getPersonName(mood.user_id)} · ${moodLabels[mood.score]}`),
      element("p", "timestamp", formatDate(mood.created_at))
    );
    if (mood.note) details.append(element("p", "note", mood.note));
    item.append(details);
    container.append(item);
  }
}

$("#calendar-prev").addEventListener("click", () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1, 12);
  renderCalendar();
});
$("#calendar-next").addEventListener("click", () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1, 12);
  renderCalendar();
});

function subscribeToMoods(id) {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  realtimeChannel = supabase
    .channel(`moods-${id}`)
    .on("postgres_changes", {
      event: "*", schema: "public", table: "mood_updates", filter: `couple_id=eq.${id}`
    }, () => refreshMoods())
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setStatus(dashboardStatus, "Live updates disconnected. Reconnecting or refresh the page.");
      }
    });
}

$("#save-mood").addEventListener("click", async () => {
  if (!currentUser || !coupleId || selectedScore === null || savingMood) return;
  savingMood = true;
  const button = $("#save-mood");
  button.disabled = true;
  button.textContent = "Saving…";
  setStatus(moodStatus, "");

  try {
    const { error } = await supabase.from("mood_updates").insert({
      couple_id: coupleId,
      user_id: currentUser.id,
      score: selectedScore,
      note: $("#mood-note").value.trim() || null
    });
    if (error) throw error;
    $("#mood-note").value = "";
    setStatus(moodStatus, "Mood saved successfully ♡");
    await refreshMoods();
  } catch (error) {
    console.error("Mood save failed:", error);
    setStatus(moodStatus, "Couldn't save your mood. Please try again.");
  } finally {
    savingMood = false;
    button.textContent = "Save my mood ♡";
    button.disabled = selectedScore === null || !coupleId;
  }
});

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) {
    showLoggedOut();
    return;
  }
  if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
    setTimeout(() => handleSession(session), 0);
  }
});

const { data: { session } } = await supabase.auth.getSession();
if (session) await handleSession(session);
else showLoggedOut();

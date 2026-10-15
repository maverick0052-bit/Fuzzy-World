
import { createClient } from
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Replace these two values with your own Supabase project details.
const SUPABASE_URL = "https://ifwuzipbpzihxbtgpbyt.supabase.co";
const SUPABASE_KEY = "sb_publishable_3Jh4eiETe8VJ0cWn7AwhtA_xrrxN-Rz";

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

const moodLabels = {
  1: "Really difficult",
  2: "Feeling very low",
  3: "A little down",
  4: "Not feeling great",
  5: "Just okay",
  6: "Doing alright",
  7: "Feeling good",
  8: "Really happy",
  9: "Amazing",
  10: "On top of the world"
};

function setStatus(element, message) {
  element.textContent = message;
}

function formatDate(value) {
  if (!value) return "Time unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Time unavailable";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata"
  }).format(date) + " IST";
}

function timeAgo(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";

  const minutes = Math.max(
    0, Math.floor((Date.now() - timestamp) / 60000)
  );

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day(s) ago`;

  return formatDate(value);
}

// Create elements safely. User-provided notes are never interpreted as HTML.
function element(tag, className, text) {
  const node = document.createElement(tag);

  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;

  return node;
}

function clearChildren(node) {
  node.replaceChildren();
}

function showLoggedOut() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  currentUser = null;
  coupleId = null;
  members = [];
  selectedScore = null;
  loadingUserId = null;
  savingMood = false;

  authPanel.hidden = false;
  dashboard.hidden = true;

  $("#mood-cards").replaceChildren();
  $("#mood-history").replaceChildren();
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

  authSubmit.textContent =
    mode === "login" ? "Log in" : "Create account";

  $("#password").autocomplete =
    mode === "login" ? "current-password" : "new-password";

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
        password
      });

      if (error) throw error;

      if (data.session) {
        setStatus(authStatus, "Account created. Opening your space…");
        await handleSession(data.session);
      } else {
        setStatus(
          authStatus,
          "Account created. Check your email to confirm it, then log in."
        );
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

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

  $("#selected-mood").textContent =
    `${score}/10 — ${moodLabels[score]}`;

  $("#save-mood").disabled = savingMood;
}

$("#mood-picker").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-score]");
  if (!button) return;

  selectMood(Number(button.dataset.score));
});

async function handleSession(session) {
  if (!session?.user) {
    showLoggedOut();
    return;
  }

  const user = session.user;

  // Avoid duplicate initialization for the same signed-in account.
  if (loadingUserId === user.id && currentUser?.id === user.id) {
    return;
  }

  if (realtimeChannel) {
    await supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  loadingUserId = user.id;
  currentUser = user;
  coupleId = null;
  members = [];

  authPanel.hidden = true;
  dashboard.hidden = false;

  setStatus(dashboardStatus, "Connecting to your shared space…");
  clearChildren($("#mood-cards"));
  clearChildren($("#mood-history"));

  try {
    const { data: ownMembership, error: memberError } =
      await supabase
        .from("couple_members")
        .select("couple_id, user_id, role")
        .eq("user_id", user.id)
        .maybeSingle();

    if (memberError) throw memberError;

    if (!ownMembership) {
      setStatus(
        dashboardStatus,
        "Your account is ready, but the shared space isn't linked yet. " +
        "Complete Step 6 below to connect both accounts."
      );
      return;
    }

    coupleId = ownMembership.couple_id;

    const { data: memberRows, error: membersError } =
      await supabase
        .from("couple_members")
        .select("couple_id, user_id, role")
        .eq("couple_id", coupleId);

    if (membersError) throw membersError;

    members = memberRows || [];

    if (members.length !== 2) {
      setStatus(
        dashboardStatus,
        "Your shared space needs both partner accounts linked. " +
        "Complete Step 6 below."
      );
      return;
    }

    const { data: couple, error: coupleError } =
      await supabase
        .from("couples")
        .select("name")
        .eq("id", coupleId)
        .single();

    if (coupleError) throw coupleError;

    $(".brand span:last-child").textContent =
      couple.name || "our little world";

    subscribeToMoods(coupleId);
    await refreshMoods();

    if (currentUser?.id === user.id) {
      setStatus(dashboardStatus, "Your shared space is connected ♡");
    }
  } catch (error) {
    console.error("Dashboard initialization failed:", error);

    setStatus(
      dashboardStatus,
      "Couldn't load your shared space. Check your connection and database setup."
    );
  }
}

async function refreshMoods() {
  if (!currentUser || !coupleId) return;

  const expectedUserId = currentUser.id;
  const expectedCoupleId = coupleId;

  const { data, error } = await supabase
    .from("mood_updates")
    .select("id, user_id, score, note, created_at")
    .eq("couple_id", expectedCoupleId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Mood refresh failed:", error);
    setStatus(dashboardStatus, "Couldn't refresh moods. Please retry.");
    return;
  }

  // Discard results if the account changed while the request was running.
  if (
    currentUser?.id !== expectedUserId ||
    coupleId !== expectedCoupleId
  ) {
    return;
  }

  renderMoodCards(data || []);
  renderMoodHistory(data || []);
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

  for (const row of rows) {
    if (!latest.has(row.user_id)) {
      latest.set(row.user_id, row);
    }
  }

  return latest;
}

function renderMoodCards(rows) {
  const container = $("#mood-cards");
  clearChildren(container);

  const latest = latestPerPerson(rows);

  const sortedMembers = [...members].sort((a, b) =>
    a.role.localeCompare(b.role)
  );

  for (const member of sortedMembers) {
    const mood = latest.get(member.user_id);
    const card = element("article", "mood-card");

    card.append(
      element("p", "person", getPersonName(member.user_id))
    );

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

      if (mood.note) {
        card.append(element("p", "note", mood.note));
      }
    }

    container.append(card);
  }
}

function renderMoodHistory(rows) {
  const container = $("#mood-history");
  clearChildren(container);

  if (!rows.length) {
    container.append(
      element("p", "muted", "No moods yet. Your first check-in starts your story ♡")
    );
    return;
  }

  for (const mood of rows.slice(0, 20)) {
    const item = element("article", "history-item");
    const score = element("div", "history-score", mood.score);
    const main = element("div", "history-main");

    main.append(
      element(
        "p",
        "",
        `${getPersonName(mood.user_id)} · ${moodLabels[mood.score]}`
      ),
      element("p", "timestamp", formatDate(mood.created_at))
    );

    if (mood.note) {
      main.append(element("p", "note", mood.note));
    }

    item.append(score, main);
    container.append(item);
  }
}

function subscribeToMoods(id) {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabase
    .channel(`moods-${id}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "mood_updates",
        filter: `couple_id=eq.${id}`
      },
      () => {
        refreshMoods();
      }
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setStatus(
          dashboardStatus,
          "Live updates disconnected. Reconnecting or refresh the page."
        );
      }
    });
}

$("#save-mood").addEventListener("click", async () => {
  if (!currentUser || !coupleId || selectedScore === null || savingMood) {
    return;
  }

  savingMood = true;

  const button = $("#save-mood");
  button.disabled = true;
  button.textContent = "Saving…";
  setStatus(moodStatus, "");

  try {
    const { error } = await supabase
      .from("mood_updates")
      .insert({
        couple_id: coupleId,
        user_id: currentUser.id,
        score: selectedScore,
        note: $("#mood-note").value.trim() || null
      });

    if (error) throw error;

    $("#mood-note").value = "";
    setStatus(moodStatus, "Mood saved successfully ♡");

    // Refresh directly as well as listening for the realtime event.
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

// Keep the login view and session synchronized.
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) {
    showLoggedOut();
    return;
  }

  // Defer database work until after the auth callback completes.
  if (event === "SIGNED_IN" || event === "INITIAL_SESSION" ||
      event === "TOKEN_REFRESHED") {
    setTimeout(() => handleSession(session), 0);
  }
});

// Initial session recovery on page load.
const { data: { session } } = await supabase.auth.getSession();

if (session) {
  await handleSession(session);
} else {
  showLoggedOut();
}

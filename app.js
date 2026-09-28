const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const state = {
  cursor: startOfMonth(new Date()),
  categories: [],
  venues: [],
  allEvents: [],
  events: [],
  hiddenVenues: new Set(),
  generatedAt: null,
};

const el = {
  monthLabel: document.getElementById("monthLabel"),
  grid: document.getElementById("grid"),
  filterBtn: document.getElementById("filterBtn"),
  filterPanel: document.getElementById("filterPanel"),
  statusMsg: document.getElementById("statusMsg"),
  overlay: document.getElementById("overlay"),
  dayPanel: document.getElementById("dayPanel"),
  dayPanelTitle: document.getElementById("dayPanelTitle"),
  dayPanelEvents: document.getElementById("dayPanelEvents"),
};

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function isSameDay(a, b) { return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }

function gridRange(monthStart) {
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth()+1, 0);
  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));
  return { gridStart, gridEnd };
}

// Static export instead of a live API: everything is fetched once at
// startup (categories.json / venues.json / events.json, regenerated
// periodically by app/publish.py in the private repo) and filtered
// client-side from then on -- there's no backend here to ask for a date
// range. window.CALENDAR_CATEGORIES (set by each page before this script
// loads) scopes a page to just those categories -- e.g. movies.html only
// ever sees movies, even though the export itself has everything.
async function loadData() {
  const [catResp, venResp, evResp] = await Promise.all([
    fetch("categories.json"),
    fetch("venues.json"),
    fetch("events.json"),
  ]);
  let categories = await catResp.json();
  let venues = await venResp.json();
  const evPayload = await evResp.json();
  let events = evPayload.events;

  const allowed = window.CALENDAR_CATEGORIES;
  if (Array.isArray(allowed)) {
    categories = categories.filter(c => allowed.includes(c.id));
    venues = venues.filter(v => allowed.includes(v.category_id));
    events = events.filter(e => allowed.includes(e.category_id));
  }

  state.categories = categories;
  state.venues = venues;
  state.allEvents = events;
  state.generatedAt = evPayload.generated_at;
  renderFilterPanel();
  renderStatus();
}

function renderStatus() {
  if (!state.generatedAt) return;
  const d = new Date(state.generatedAt);
  el.statusMsg.textContent = `Updated ${d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

function loadEvents() {
  const { gridStart, gridEnd } = gridRange(state.cursor);
  const endExclusive = new Date(gridEnd);
  endExclusive.setDate(endExclusive.getDate() + 1);
  const start = toDateStr(gridStart);
  const end = toDateStr(endExclusive);
  state.events = state.allEvents.filter(e => e.start_dt >= start && e.start_dt < end);
}

function venueColor(colorSlot) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--slot-${colorSlot}`).trim();
}

function venuesInCategory(catId) {
  return state.venues.filter(v => v.category_id === catId);
}

function setVenueHidden(venueId, hidden) {
  if (hidden) state.hiddenVenues.add(venueId);
  else state.hiddenVenues.delete(venueId);
}

function renderFilterPanel() {
  el.filterPanel.innerHTML = "";

  for (const cat of state.categories) {
    const venues = venuesInCategory(cat.id);
    const hiddenCount = venues.filter(v => state.hiddenVenues.has(v.id)).length;
    const allHidden = venues.length > 0 && hiddenCount === venues.length;
    const someHidden = hiddenCount > 0 && !allHidden;
    const color = venueColor(cat.color_slot);

    const group = document.createElement("div");
    group.className = "filter-group";

    const catRow = document.createElement("div");
    catRow.className = "filter-row category";
    const catCheckbox = document.createElement("input");
    catCheckbox.type = "checkbox";
    catCheckbox.checked = !allHidden;
    catCheckbox.indeterminate = someHidden;
    catCheckbox.style.setProperty("--row-accent", color);
    const catId = `filter-cat-${cat.id}`;
    catCheckbox.id = catId;
    catRow.appendChild(catCheckbox);
    const catLabel = document.createElement("label");
    catLabel.htmlFor = catId;
    catLabel.textContent = cat.name;
    catRow.appendChild(catLabel);

    catRow.addEventListener("click", (e) => {
      e.preventDefault();
      const showAll = allHidden || someHidden;
      for (const v of venues) setVenueHidden(v.id, !showAll);
      renderFilterPanel();
      renderGrid();
    });

    group.appendChild(catRow);

    const subgroup = document.createElement("div");
    subgroup.className = "filter-subgroup";
    for (const v of venues) {
      const vRow = document.createElement("div");
      vRow.className = "filter-row venue";
      const vCheckbox = document.createElement("input");
      vCheckbox.type = "checkbox";
      vCheckbox.checked = !state.hiddenVenues.has(v.id);
      vCheckbox.style.setProperty("--row-accent", color);
      const vId = `filter-venue-${v.id}`;
      vCheckbox.id = vId;
      vRow.appendChild(vCheckbox);
      const vLabel = document.createElement("label");
      vLabel.htmlFor = vId;
      vLabel.textContent = v.name;
      vRow.appendChild(vLabel);

      vRow.addEventListener("click", (e) => {
        e.preventDefault();
        setVenueHidden(v.id, !state.hiddenVenues.has(v.id));
        renderFilterPanel();
        renderGrid();
      });

      subgroup.appendChild(vRow);
    }
    group.appendChild(subgroup);

    el.filterPanel.appendChild(group);
  }
}

function openFilterPanel(open) {
  el.filterPanel.classList.toggle("open", open);
  el.filterBtn.classList.toggle("open", open);
  el.filterBtn.setAttribute("aria-expanded", String(open));
}

el.filterBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  openFilterPanel(!el.filterPanel.classList.contains("open"));
});
document.addEventListener("click", (e) => {
  if (el.filterPanel.classList.contains("open") && !el.filterPanel.contains(e.target) && e.target !== el.filterBtn) {
    openFilterPanel(false);
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") openFilterPanel(false);
});

function eventsByDate() {
  const map = new Map();
  for (const e of state.events) {
    if (state.hiddenVenues.has(e.venue_id)) continue;
    const dateStr = e.start_dt.slice(0, 10);
    if (!map.has(dateStr)) map.set(dateStr, []);
    map.get(dateStr).push(e);
  }
  for (const list of map.values()) list.sort((a, b) => a.start_dt.localeCompare(b.start_dt));
  return map;
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function renderGrid() {
  el.grid.innerHTML = "";
  const { gridStart, gridEnd } = gridRange(state.cursor);
  const byDate = eventsByDate();
  const today = new Date();

  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    const dateStr = toDateStr(cursor);
    const dayEvents = byDate.get(dateStr) || [];
    const cell = document.createElement("div");
    cell.className = "day-cell";
    if (cursor.getMonth() !== state.cursor.getMonth()) cell.classList.add("other-month");
    if (isSameDay(cursor, today)) cell.classList.add("today");

    const dayNum = document.createElement("div");
    dayNum.className = "day-number";
    dayNum.textContent = cursor.getDate();
    cell.appendChild(dayNum);

    const mobile = window.innerWidth <= 640;
    const maxPills = mobile ? 10 : 3;
    dayEvents.slice(0, maxPills).forEach(ev => {
      const pill = document.createElement("div");
      pill.className = "event-pill";
      pill.textContent = ev.title;
      pill.style.background = venueColor(ev.color_slot);
      pill.title = ev.title;
      cell.appendChild(pill);
    });
    if (!mobile && dayEvents.length > maxPills) {
      const more = document.createElement("div");
      more.className = "more-link";
      more.textContent = `+${dayEvents.length - maxPills} more`;
      cell.appendChild(more);
    }
    if (dayEvents.length > 0) {
      cell.classList.add("has-events");
      cell.addEventListener("click", () => openDayPanel(dateStr, dayEvents));
    }

    el.grid.appendChild(cell);
    cursor.setDate(cursor.getDate() + 1);
  }
}

function openDayPanel(dateStr, events) {
  const d = new Date(dateStr + "T00:00:00");
  el.dayPanelTitle.textContent = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  el.dayPanelEvents.innerHTML = "";
  if (events.length === 0) {
    const empty = document.createElement("p");
    empty.style.cssText = "color:var(--muted);font-size:0.9rem;text-align:center;padding:24px 0";
    empty.textContent = "No events today";
    el.dayPanelEvents.appendChild(empty);
  } else {
    for (const ev of events) {
      const venue = state.venues.find(v => v.id === ev.venue_id);
      const div = document.createElement("div");
      div.className = "event-detail";
      div.style.borderLeftColor = venueColor(ev.color_slot);
      const timeRange = ev.end_dt ? `${formatTime(ev.start_dt)} – ${formatTime(ev.end_dt)}` : formatTime(ev.start_dt);
      div.innerHTML = `
        <div class="ev-venue"><span class="legend-dot" style="background:${venueColor(ev.color_slot)}"></span>${ev.category_name} &middot; ${venue ? venue.name : ev.venue_name}</div>
        <p class="ev-title">${escapeHtml(ev.title)}</p>
        <div class="ev-time">${timeRange}</div>
        ${ev.image_url ? `<img class="ev-image" src="${escapeHtml(ev.image_url)}" alt="">` : ""}
        ${ev.description ? `<div class="ev-desc">${escapeHtml(ev.description)}</div>` : ""}
        ${ev.url ? `<a class="ev-link" href="${escapeHtml(ev.url)}" target="_blank" rel="noopener noreferrer">Open event &rarr;</a>` : ""}
      `;
      el.dayPanelEvents.appendChild(div);
    }
  }
  el.overlay.classList.remove("hidden");
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s || "";
  return div.innerHTML;
}

function updateMonthLabel() {
  el.monthLabel.textContent = `${MONTH_NAMES[state.cursor.getMonth()]} ${state.cursor.getFullYear()}`;
}

function refreshView() {
  updateMonthLabel();
  loadEvents();
  renderGrid();
}

document.getElementById("prevBtn").addEventListener("click", () => {
  state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() - 1, 1);
  refreshView();
});
document.getElementById("nextBtn").addEventListener("click", () => {
  state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + 1, 1);
  refreshView();
});
document.getElementById("todayBtn").addEventListener("click", () => {
  const today = new Date();
  const alreadyHere = state.cursor.getFullYear() === today.getFullYear() &&
                      state.cursor.getMonth() === today.getMonth();
  state.cursor = startOfMonth(today);
  if (!alreadyHere) refreshView();
  const todayStr = toDateStr(today);
  openDayPanel(todayStr, eventsByDate().get(todayStr) || []);
});
document.getElementById("closePanelBtn").addEventListener("click", () => {
  el.overlay.classList.add("hidden");
});
el.overlay.addEventListener("click", (e) => {
  if (e.target === el.overlay) el.overlay.classList.add("hidden");
});

(async function init() {
  await loadData();
  refreshView();
})();

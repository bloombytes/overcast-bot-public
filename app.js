const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOW_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DOW_FULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

const TG_START_HOUR = 7;   // time-grid default window if no events give a tighter range
const TG_END_HOUR = 23;
const TG_HOUR_PX = 48;

const state = {
  cursor: startOfDay(new Date()),   // the date the current view is centered on
  viewMode: "month",                // month | week | day | year
  categories: [],
  venues: [],
  allEvents: [],
  generatedAt: null,
  searchQuery: "",
};

const el = {};

function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function isSameDay(a, b) { return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function startOfWeek(d) { const r = startOfDay(d); r.setDate(r.getDate() - r.getDay()); return r; }

function venueColor(colorSlot) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--slot-${colorSlot}`).trim();
}
function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s || "";
  return div.innerHTML;
}
function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// ============ Data loading ============

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
  state.allEvents = events.slice().sort((a, b) => a.start_dt.localeCompare(b.start_dt));
  state.generatedAt = evPayload.generated_at;
}

function eventsOnDay(dateStr) {
  return state.allEvents.filter(e => e.start_dt.slice(0, 10) === dateStr)
    .sort((a, b) => a.start_dt.localeCompare(b.start_dt));
}
function eventsInRange(startStr, endExclusiveStr) {
  return state.allEvents.filter(e => e.start_dt >= startStr && e.start_dt < endExclusiveStr);
}
function hasEventsOn(dateStr) {
  return state.allEvents.some(e => e.start_dt.slice(0, 10) === dateStr);
}

// ============ Sidebar: mini calendar ============

function renderMiniCal() {
  const monthStart = startOfMonth(state.cursor);
  el.miniMonthLabel.textContent = `${MONTH_SHORT[monthStart.getMonth()]} ${monthStart.getFullYear()}`;

  const gridStart = startOfWeek(monthStart);
  el.miniGrid.innerHTML = "";
  const today = startOfDay(new Date());

  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    const dateStr = toDateStr(d);
    const cell = document.createElement("div");
    cell.className = "mini-day";
    cell.textContent = d.getDate();
    if (d.getMonth() !== monthStart.getMonth()) cell.classList.add("other-month");
    if (isSameDay(d, today)) cell.classList.add("today");
    if (isSameDay(d, state.cursor) && !isSameDay(d, today)) cell.classList.add("selected");
    if (hasEventsOn(dateStr)) cell.classList.add("has-events");
    cell.addEventListener("click", () => {
      state.cursor = d;
      state.viewMode = "day";
      render();
    });
    el.miniGrid.appendChild(cell);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // wired up in init() once elements exist
});

// ============ Sidebar: agenda list ============

function relativeDayLabel(d, today) {
  const diff = Math.round((startOfDay(d) - today) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return `${DOW_FULL[d.getDay()]}`;
}

function renderAgenda() {
  const today = startOfDay(new Date());
  const query = state.searchQuery.trim().toLowerCase();

  let upcoming = state.allEvents.filter(e => e.start_dt.slice(0, 10) >= toDateStr(today));
  if (query) {
    upcoming = upcoming.filter(e =>
      e.title.toLowerCase().includes(query) || (e.venue_name || "").toLowerCase().includes(query)
    );
  }

  el.agendaList.innerHTML = "";
  if (upcoming.length === 0) {
    const empty = document.createElement("div");
    empty.className = "agenda-empty";
    empty.textContent = query ? "No matching events." : "Nothing upcoming.";
    el.agendaList.appendChild(empty);
    return;
  }

  const byDate = new Map();
  for (const ev of upcoming) {
    const dateStr = ev.start_dt.slice(0, 10);
    if (!byDate.has(dateStr)) byDate.set(dateStr, []);
    byDate.get(dateStr).push(ev);
  }

  const dates = Array.from(byDate.keys()).sort().slice(0, 21); // cap how far ahead we render
  for (const dateStr of dates) {
    const d = new Date(dateStr + "T00:00:00");
    const heading = document.createElement("div");
    heading.className = "agenda-day-heading";
    heading.innerHTML = `<span class="rel">${relativeDayLabel(d, today)}</span> &middot; ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
    el.agendaList.appendChild(heading);

    for (const ev of byDate.get(dateStr)) {
      const row = document.createElement("div");
      row.className = "agenda-row";
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = venueColor(ev.color_slot);
      const time = document.createElement("span");
      time.className = "time";
      time.textContent = formatTime(ev.start_dt);
      const title = document.createElement("span");
      title.className = "title";
      title.textContent = ev.title;
      row.append(dot, time, title);
      row.addEventListener("click", () => openDayPanel(dateStr, byDate.get(dateStr)));
      el.agendaList.appendChild(row);
    }
  }
}

// ============ View label + nav ============

function updateViewLabel() {
  if (state.viewMode === "month") {
    el.viewLabel.textContent = `${MONTH_NAMES[state.cursor.getMonth()]} ${state.cursor.getFullYear()}`;
  } else if (state.viewMode === "week") {
    const start = startOfWeek(state.cursor);
    const end = addDays(start, 6);
    const sameMonth = start.getMonth() === end.getMonth();
    el.viewLabel.textContent = sameMonth
      ? `${MONTH_SHORT[start.getMonth()]} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`
      : `${MONTH_SHORT[start.getMonth()]} ${start.getDate()} – ${MONTH_SHORT[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
  } else if (state.viewMode === "day") {
    el.viewLabel.textContent = `${DOW_FULL[state.cursor.getDay()]}, ${MONTH_NAMES[state.cursor.getMonth()]} ${state.cursor.getDate()}`;
  } else {
    el.viewLabel.textContent = `${state.cursor.getFullYear()}`;
  }
}

function navigate(direction) {
  if (state.viewMode === "month") state.cursor = addMonths(state.cursor, direction);
  else if (state.viewMode === "week") state.cursor = addDays(state.cursor, direction * 7);
  else if (state.viewMode === "day") state.cursor = addDays(state.cursor, direction);
  else state.cursor = new Date(state.cursor.getFullYear() + direction, state.cursor.getMonth(), 1);
  render();
}

// ============ Month view ============

function renderMonthView(container) {
  const weekdayRow = document.createElement("div");
  weekdayRow.className = "weekday-row";
  for (const d of DOW_SHORT) {
    const cell = document.createElement("div");
    cell.textContent = d;
    weekdayRow.appendChild(cell);
  }
  container.appendChild(weekdayRow);

  const grid = document.createElement("div");
  grid.className = "grid";

  const monthStart = startOfMonth(state.cursor);
  const gridStart = startOfWeek(monthStart);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const gridEnd = addDays(monthEnd, 6 - monthEnd.getDay());
  const today = startOfDay(new Date());
  const mobile = window.innerWidth <= 640;
  const maxPills = mobile ? 10 : 3;

  let cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    const dateStr = toDateStr(cursor);
    const dayEvents = eventsOnDay(dateStr);
    const cell = document.createElement("div");
    cell.className = "day-cell";
    if (cursor.getMonth() !== monthStart.getMonth()) cell.classList.add("other-month");
    if (isSameDay(cursor, today)) cell.classList.add("today");

    const dayNum = document.createElement("div");
    dayNum.className = "day-number";
    dayNum.textContent = cursor.getDate();
    cell.appendChild(dayNum);

    dayEvents.slice(0, maxPills).forEach(ev => {
      const pill = document.createElement("div");
      pill.className = "event-pill";
      pill.textContent = ev.title;
      pill.style.setProperty("--pill-color", venueColor(ev.color_slot));
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

    grid.appendChild(cell);
    cursor = addDays(cursor, 1);
  }
  container.appendChild(grid);
}

// ============ Week / Day time-grid view ============

function timeGridRange(events) {
  let minH = TG_START_HOUR, maxH = TG_END_HOUR;
  for (const ev of events) {
    const h = Number(ev.start_dt.slice(11, 13));
    if (!Number.isNaN(h)) {
      minH = Math.min(minH, h);
      maxH = Math.max(maxH, h + 2); // leave room below the last start time
    }
  }
  return { startHour: Math.max(0, Math.min(minH, TG_START_HOUR)), endHour: Math.min(24, Math.max(maxH, TG_END_HOUR)) };
}

function eventSpan(ev) {
  const startH = Number(ev.start_dt.slice(11, 13)) + Number(ev.start_dt.slice(14, 16)) / 60;
  const durationH = ev.end_dt
    ? Math.max(0.5, (new Date(ev.end_dt) - new Date(ev.start_dt)) / 3600000)
    : 1.5;
  return { startH, endH: startH + durationH };
}

// Side-by-side layout for events that overlap in time, same idea most
// calendar UIs use: cluster mutually-overlapping events, greedily pack
// each cluster into the fewest columns (an event reuses a column once
// its predecessor there has ended), then give every event in a cluster
// an equal share of the day column's width.
function layoutDayEvents(dayEvents) {
  const sorted = dayEvents
    .map(ev => ({ ev, ...eventSpan(ev) }))
    .sort((a, b) => a.startH - b.startH);

  const results = [];
  let cluster = [];
  let clusterEnd = -Infinity;

  function packCluster(items) {
    const columnEnds = []; // end time currently occupied in each column
    for (const item of items) {
      let col = columnEnds.findIndex(end => item.startH >= end);
      if (col === -1) {
        col = columnEnds.length;
        columnEnds.push(item.endH);
      } else {
        columnEnds[col] = item.endH;
      }
      item.column = col;
    }
    const columnCount = columnEnds.length;
    for (const item of items) results.push({ ...item, columnCount });
  }

  for (const item of sorted) {
    if (cluster.length && item.startH >= clusterEnd) {
      packCluster(cluster);
      cluster = [];
      clusterEnd = -Infinity;
    }
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.endH);
  }
  if (cluster.length) packCluster(cluster);

  return results;
}

// Scrapers/community submissions that don't know a real start time default
// to 00:00 (same convention app/discord.py's digest already uses to mean
// "all-day / no known time" -- see _fmt_time there). Those get their own
// all-day strip instead of cramming a misleading "12:00 AM" block into the
// hourly grid.
function isNoTimeEvent(ev) {
  return ev.start_dt.slice(11, 16) === "00:00";
}

function renderTimeGrid(container, days) {
  // days: array of Date, 1 for day view, 7 for week view
  const dayBuckets = days.map(d => {
    const dateStr = toDateStr(d);
    const all = eventsOnDay(dateStr);
    return {
      d, dateStr,
      allDay: all.filter(isNoTimeEvent),
      timed: all.filter(ev => !isNoTimeEvent(ev)),
    };
  });
  const maxAllDay = Math.max(0, ...dayBuckets.map(b => b.allDay.length));
  const { startHour, endHour } = timeGridRange(dayBuckets.flatMap(b => b.timed));
  const totalHours = endHour - startHour;
  const today = startOfDay(new Date());

  const wrap = document.createElement("div");
  wrap.className = "timegrid-wrap";
  const grid = document.createElement("div");
  grid.className = "timegrid";

  const headerRow = document.createElement("div");
  headerRow.className = "tg-header-row";
  headerRow.style.gridTemplateColumns = `52px repeat(${days.length}, 1fr)`;
  const corner = document.createElement("div");
  headerRow.appendChild(corner);
  for (const d of days) {
    const cell = document.createElement("div");
    cell.className = "tg-header-cell";
    if (isSameDay(d, today)) cell.classList.add("today");
    cell.innerHTML = `<div class="dow">${DOW_SHORT[d.getDay()]}</div><div class="num">${d.getDate()}</div>`;
    headerRow.appendChild(cell);
  }
  grid.appendChild(headerRow);

  if (maxAllDay > 0) {
    const alldayRow = document.createElement("div");
    alldayRow.className = "tg-allday-row";
    alldayRow.style.gridTemplateColumns = `52px repeat(${days.length}, 1fr)`;
    const alldayCorner = document.createElement("div");
    alldayCorner.className = "tg-allday-label";
    alldayCorner.textContent = "All-day";
    alldayRow.appendChild(alldayCorner);
    for (const bucket of dayBuckets) {
      const cell = document.createElement("div");
      cell.className = "tg-allday-cell";
      for (const ev of bucket.allDay) {
        const chip = document.createElement("div");
        chip.className = "tg-allday-chip";
        chip.textContent = ev.title;
        chip.title = ev.title;
        chip.style.setProperty("--pill-color", venueColor(ev.color_slot));
        chip.addEventListener("click", () => openDayPanel(bucket.dateStr, bucket.allDay.concat(bucket.timed)));
        cell.appendChild(chip);
      }
      alldayRow.appendChild(cell);
    }
    grid.appendChild(alldayRow);
  }

  const body = document.createElement("div");
  body.className = "tg-body";

  const hoursCol = document.createElement("div");
  hoursCol.className = "tg-hours";
  hoursCol.style.height = `${totalHours * TG_HOUR_PX}px`;
  for (let h = startHour; h < endHour; h++) {
    const label = document.createElement("div");
    label.className = "tg-hour-label";
    label.style.height = `${TG_HOUR_PX}px`;
    const ampm = h < 12 ? "AM" : "PM";
    const h12 = h % 12 || 12;
    label.textContent = `${h12} ${ampm}`;
    hoursCol.appendChild(label);
  }
  body.appendChild(hoursCol);

  const columns = document.createElement("div");
  columns.className = "tg-columns";
  columns.style.gridTemplateColumns = `repeat(${days.length}, 1fr)`;
  columns.style.height = `${totalHours * TG_HOUR_PX}px`;

  dayBuckets.forEach(bucket => {
    const { dateStr } = bucket;
    const dayEvents = bucket.allDay.concat(bucket.timed);
    const col = document.createElement("div");
    col.className = "tg-column";
    for (let h = startHour; h < endHour; h++) {
      const line = document.createElement("div");
      line.className = "tg-hour-line";
      col.appendChild(line);
    }
    const laidOut = layoutDayEvents(bucket.timed);
    for (const { ev, startH, endH, column, columnCount } of laidOut) {
      const top = Math.max(0, (startH - startHour) * TG_HOUR_PX);
      const height = Math.max(20, (endH - startH) * TG_HOUR_PX - 2);
      const widthPct = 100 / columnCount;

      const block = document.createElement("div");
      block.className = "tg-event";
      block.style.top = `${top}px`;
      block.style.height = `${height}px`;
      block.style.left = `calc(${column * widthPct}% + 2px)`;
      block.style.width = `calc(${widthPct}% - 4px)`;
      block.style.setProperty("--pill-color", venueColor(ev.color_slot));
      block.innerHTML = `<span class="tg-ev-time">${formatTime(ev.start_dt)}</span><span class="tg-ev-title">${escapeHtml(ev.title)}</span>`;
      block.addEventListener("click", () => openDayPanel(dateStr, dayEvents));
      col.appendChild(block);
    }
    columns.appendChild(col);
  });
  body.appendChild(columns);
  grid.appendChild(body);
  wrap.appendChild(grid);
  container.appendChild(wrap);
}

function renderWeekView(container) {
  const start = startOfWeek(state.cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  renderTimeGrid(container, days);
}
function renderDayView(container) {
  renderTimeGrid(container, [state.cursor]);
}

// ============ Year view ============

function renderYearView(container) {
  const year = state.cursor.getFullYear();
  const today = startOfDay(new Date());
  const grid = document.createElement("div");
  grid.className = "year-grid";

  for (let m = 0; m < 12; m++) {
    const monthStart = new Date(year, m, 1);
    const box = document.createElement("div");
    box.className = "year-month";
    box.addEventListener("click", () => {
      state.cursor = monthStart;
      state.viewMode = "month";
      render();
    });

    const label = document.createElement("div");
    label.className = "ym-label";
    label.textContent = MONTH_SHORT[m];
    box.appendChild(label);

    const ymGrid = document.createElement("div");
    ymGrid.className = "ym-grid";
    const gridStart = startOfWeek(monthStart);
    for (let i = 0; i < 42; i++) {
      const d = addDays(gridStart, i);
      const cell = document.createElement("div");
      cell.className = "ym-day";
      if (d.getMonth() !== m) {
        cell.classList.add("other-month");
      } else {
        cell.textContent = d.getDate();
        if (isSameDay(d, today)) cell.classList.add("today");
        if (hasEventsOn(toDateStr(d))) cell.classList.add("has-events");
      }
      ymGrid.appendChild(cell);
    }
    box.appendChild(ymGrid);
    grid.appendChild(box);
  }
  container.appendChild(grid);
}

// ============ Day-detail overlay ============

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

// ============ Top-level render ============

function render() {
  updateViewLabel();
  renderMiniCal();

  document.querySelectorAll(".view-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === state.viewMode);
  });

  el.viewContainer.innerHTML = "";
  if (state.viewMode === "month") renderMonthView(el.viewContainer);
  else if (state.viewMode === "week") renderWeekView(el.viewContainer);
  else if (state.viewMode === "day") renderDayView(el.viewContainer);
  else renderYearView(el.viewContainer);
}

function renderStatus() {
  if (!state.generatedAt || !el.statusMsg) return;
  const d = new Date(state.generatedAt);
  el.statusMsg.textContent = `Updated ${d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

function bindElements() {
  el.sidebar = document.getElementById("sidebar");
  el.sidebarScrim = document.getElementById("sidebarScrim");
  el.sidebarToggle = document.getElementById("sidebarToggle");
  el.miniMonthLabel = document.getElementById("miniMonthLabel");
  el.miniGrid = document.getElementById("miniGrid");
  el.miniPrevBtn = document.getElementById("miniPrevBtn");
  el.miniNextBtn = document.getElementById("miniNextBtn");
  el.searchInput = document.getElementById("searchInput");
  el.agendaList = document.getElementById("agendaList");
  el.viewLabel = document.getElementById("viewLabel");
  el.viewContainer = document.getElementById("viewContainer");
  el.prevBtn = document.getElementById("prevBtn");
  el.nextBtn = document.getElementById("nextBtn");
  el.todayBtn = document.getElementById("todayBtn");
  el.statusMsg = document.getElementById("statusMsg");
  el.overlay = document.getElementById("overlay");
  el.dayPanel = document.getElementById("dayPanel");
  el.dayPanelTitle = document.getElementById("dayPanelTitle");
  el.dayPanelEvents = document.getElementById("dayPanelEvents");
  el.closePanelBtn = document.getElementById("closePanelBtn");
}

function bindEvents() {
  el.prevBtn.addEventListener("click", () => navigate(-1));
  el.nextBtn.addEventListener("click", () => navigate(1));
  el.todayBtn.addEventListener("click", () => {
    state.cursor = startOfDay(new Date());
    render();
  });

  document.querySelectorAll(".view-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.viewMode = btn.dataset.view;
      render();
    });
  });

  el.miniPrevBtn.addEventListener("click", () => {
    state.cursor = addMonths(startOfMonth(state.cursor), -1);
    renderMiniCal();
  });
  el.miniNextBtn.addEventListener("click", () => {
    state.cursor = addMonths(startOfMonth(state.cursor), 1);
    renderMiniCal();
  });

  el.searchInput.addEventListener("input", () => {
    state.searchQuery = el.searchInput.value;
    renderAgenda();
  });

  el.closePanelBtn.addEventListener("click", () => el.overlay.classList.add("hidden"));
  el.overlay.addEventListener("click", (e) => {
    if (e.target === el.overlay) el.overlay.classList.add("hidden");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") el.overlay.classList.add("hidden");
  });

  if (el.sidebarToggle) {
    el.sidebarToggle.addEventListener("click", () => {
      el.sidebar.classList.add("open");
      el.sidebarScrim.classList.add("open");
    });
    el.sidebarScrim.addEventListener("click", () => {
      el.sidebar.classList.remove("open");
      el.sidebarScrim.classList.remove("open");
    });
  }

  window.addEventListener("resize", () => { if (state.viewMode === "month") render(); });
}

(async function init() {
  bindElements();
  bindEvents();
  await loadData();
  renderAgenda();
  renderStatus();
  render();
})();

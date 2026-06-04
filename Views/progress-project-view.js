const page = dv.current();
const currentFile = app.vault.getFileByPath(page.file.path);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value.array === "function") return value.array();
  return [];
}

function fieldValue(source, names) {
  for (const name of names) {
    const value = source?.[name];
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function normalizeHexColor(value, fallback = "#2f80ed") {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^#([0-9a-fA-F]{6})$/);
  return match ? `#${match[1].toLowerCase()}` : fallback;
}

function hexToRgb(hex) {
  const match = String(hex ?? "").match(/^#([0-9a-f]{6})$/i);
  if (!match) return { r: 47, g: 128, b: 237 };
  const value = match[1];
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  };
}

function progressFillStyle(color, pct = 100) {
  const { r, g, b } = hexToRgb(color);
  const alpha = Math.max(0, Math.min(pct, 100)) / 100;
  return `linear-gradient(90deg, rgba(${r}, ${g}, ${b}, 0) 0%, rgba(${r}, ${g}, ${b}, ${alpha}) 100%)`;
}

function getViewStateKey() {
  return `progress-view:${page.file.path}`;
}

function getViewState() {
  globalThis.__progressViewState ??= new Map();
  return globalThis.__progressViewState;
}

function amountValue(value) {
  const n = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function cleanNumber(value) {
  const n = amountValue(value);
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

function stampNow() {
  if (typeof moment !== "undefined") {
    return moment().format("YYYY-MM-DDTHH:mm");
  }
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dateInputValue(value) {
  if (!value) return "";
  if (value?.toFormat) return value.toFormat("yyyy-MM-dd'T'HH:mm");
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = n => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
  }
  const raw = String(value);
  const match = raw.match(/\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2})?/);
  return match ? match[0].replace(" ", "T") : "";
}

function sortStamp(value) {
  const normalized = dateInputValue(value);
  const time = new Date(normalized).getTime();
  return Number.isFinite(time) ? time : 0;
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeRecords(records) {
  return toArray(records)
    .map(record => ({
      id: String(record?.id ?? makeId()),
      recorded: dateInputValue(record?.recorded) || stampNow(),
      amount: Math.max(1, amountValue(record?.amount) || 1),
      note: String(record?.note ?? "")
    }))
    .sort((a, b) => sortStamp(a.recorded) - sortStamp(b.recorded));
}

function legacyRecords() {
  return page.file.lists
    .where(item => item.amount)
    .array()
    .map(item => ({
      recorded: item.recorded,
      amount: item.amount,
      note: item.note ?? ""
    }));
}

const total = Number(page.total ?? 0);
const unit = page.unit ?? "份";
const frontmatterRecords = toArray(fieldValue(page, ["progressRecords", "progressrecords", "progress-records"]));
const frontmatterColor = normalizeHexColor(fieldValue(page, ["progressBarColor", "progressbarcolor", "progress-bar-color"]));
let logs = normalizeRecords(frontmatterRecords.length ? frontmatterRecords : legacyRecords());
let currentBarColor = frontmatterColor;

const style = document.createElement("style");
style.textContent = `
  .pp-wrap { display: grid; gap: 12px; margin: 4px 0 16px; }
  .pp-actions { display: flex; justify-content: flex-start; align-items: center; gap: 8px; min-height: 24px; padding-left: 2px; }
  .pp-add-btn, .pp-icon-btn { width: 24px; height: 24px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); padding: 0; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
  .pp-add-btn:hover, .pp-icon-btn:hover { background: var(--background-modifier-hover); }
  .pp-add-btn:active, .pp-icon-btn:active { transform: translateY(1px); }
  .pp-icon-btn { width: 22px; height: 22px; color: var(--text-muted); }
  .pp-save-state { color: var(--text-muted); font-size: 0.78em; }
  .pp-card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(108px, 1fr)); gap: 8px; }
  .pp-card { border: 1px solid var(--background-modifier-border); border-radius: 6px; padding: 8px 10px; background: transparent; min-height: 58px; }
  .pp-card-label { color: var(--text-muted); font-size: 0.72em; line-height: 1.2; }
  .pp-card-value { font-size: 1.12em; line-height: 1.25; font-weight: 700; margin-top: 6px; }
  .pp-bar { height: 8px; background: transparent; border: 1px solid var(--background-modifier-border); border-radius: 999px; overflow: hidden; }
  .pp-fill { height: 100%; border-radius: 999px; transition: width 120ms ease, background 120ms ease; }
  .pp-table-wrap { overflow: auto; max-height: min(62vh, 720px); overscroll-behavior: contain; }
  .pp-table { width: 100%; min-width: 680px; border-collapse: collapse; table-layout: fixed; }
  .pp-table th, .pp-table td { border-bottom: 1px solid var(--background-modifier-border); padding: 6px; text-align: left; font-size: 0.9em; vertical-align: middle; }
  .pp-table th { color: var(--text-muted); font-size: 0.76em; font-weight: 650; }
  .pp-col-time { width: 170px; }
  .pp-col-amount { width: 98px; }
  .pp-col-cumulative { width: 112px; }
  .pp-col-pct { width: 78px; }
  .pp-col-action { width: 38px; }
  .pp-input { width: 100%; min-height: 28px; box-sizing: border-box; border: 1px solid var(--background-modifier-border); border-radius: 5px; background: var(--background-primary); color: var(--text-normal); padding: 3px 6px; font: inherit; }
  .pp-input:focus { border-color: var(--interactive-accent); box-shadow: 0 0 0 1px var(--interactive-accent); outline: none; }
  .pp-color { width: 24px; height: 24px; padding: 0; border: 1px solid var(--background-modifier-border); border-radius: 6px; background: transparent; cursor: pointer; }
  .pp-color::-webkit-color-swatch-wrapper { padding: 0; }
  .pp-color::-webkit-color-swatch { border: none; border-radius: 5px; }
  .pp-muted { color: var(--text-muted); }
`;
dv.container.appendChild(style);

const wrap = document.createElement("div");
wrap.className = "pp-wrap";
wrap.innerHTML = `
  <div class="pp-actions">
    <button type="button" class="pp-add-btn" title="添加一条进度记录" aria-label="添加进度记录"></button>
    <input type="color" class="pp-color" value="${esc(frontmatterColor)}" title="进度条颜色" aria-label="进度条颜色">
    <span class="pp-save-state" aria-live="polite"></span>
  </div>

  <div class="pp-card-grid">
    <div class="pp-card">
      <div class="pp-card-label">已完成</div>
      <div class="pp-card-value pp-done">0/${esc(total)}</div>
    </div>
    <div class="pp-card">
      <div class="pp-card-label">百分比</div>
      <div class="pp-card-value pp-pct">0%</div>
    </div>
    <div class="pp-card">
      <div class="pp-card-label">剩余</div>
      <div class="pp-card-value pp-remaining">0 ${esc(unit)}</div>
    </div>
    <div class="pp-card">
      <div class="pp-card-label">记录次数</div>
      <div class="pp-card-value pp-count">0</div>
    </div>
  </div>

  <div class="pp-bar">
    <div class="pp-fill"></div>
  </div>

  <p class="pp-muted pp-warning" style="display:none"></p>

  <div class="pp-table-wrap">
    <table class="pp-table">
      <thead>
        <tr>
          <th class="pp-col-time">时间</th>
          <th class="pp-col-amount">本次完成</th>
          <th>备注</th>
          <th class="pp-col-cumulative">累计</th>
          <th class="pp-col-pct">百分比</th>
          <th class="pp-col-action"></th>
        </tr>
      </thead>
      <tbody class="pp-tbody"></tbody>
    </table>
  </div>
`;
dv.container.appendChild(wrap);

const addBtn = wrap.querySelector(".pp-add-btn");
const statusEl = wrap.querySelector(".pp-save-state");
const doneEl = wrap.querySelector(".pp-done");
const pctEl = wrap.querySelector(".pp-pct");
const remainingEl = wrap.querySelector(".pp-remaining");
const countEl = wrap.querySelector(".pp-count");
const fillEl = wrap.querySelector(".pp-fill");
const warningEl = wrap.querySelector(".pp-warning");
const tbodyEl = wrap.querySelector(".pp-tbody");
const colorEl = wrap.querySelector(".pp-color");
const tableWrapEl = wrap.querySelector(".pp-table-wrap");
const viewState = getViewState();
const viewStateKey = getViewStateKey();
let lastScrollTop = 0;

if (typeof setIcon === "function") {
  setIcon(addBtn, "plus");
} else {
  addBtn.textContent = "+";
}

function sortLogs() {
  logs.sort((a, b) => sortStamp(a.recorded) - sortStamp(b.recorded));
}

function toPlainRecords() {
  return logs.map(log => ({
    id: log.id,
    recorded: dateInputValue(log.recorded) || stampNow(),
    amount: Math.max(1, amountValue(log.amount) || 1),
    note: String(log.note ?? "")
  }));
}

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

let saveTimer = null;
let saveQueue = Promise.resolve();

function writeRecordsNow() {
  if (!currentFile || !app.fileManager?.processFrontMatter) {
    setStatus("无法保存");
    return Promise.resolve();
  }
  viewState.set(viewStateKey, {
    scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY ?? 0,
    tableScrollTop: tableWrapEl?.scrollTop ?? 0
  });
  setStatus("保存中");
  saveQueue = saveQueue
    .then(() => app.fileManager.processFrontMatter(currentFile, frontmatter => {
      frontmatter.progressRecords = toPlainRecords();
      frontmatter.progressBarColor = currentBarColor;
    }))
    .then(() => setStatus("已保存"))
    .then(() => {
      const saved = viewState.get(viewStateKey);
      if (saved) {
        requestAnimationFrame(() => {
          const y = Number(saved.scrollTop ?? lastScrollTop ?? 0);
          if (tableWrapEl && Number.isFinite(saved.tableScrollTop)) {
            tableWrapEl.scrollTop = saved.tableScrollTop;
          }
          window.scrollTo({ top: y, behavior: "auto" });
        });
      }
    })
    .catch(error => {
      console.error(error);
      setStatus("保存失败");
      if (typeof Notice === "function") new Notice("进度保存失败，请稍后再试。");
    });
  return saveQueue;
}

function scheduleSave(delay = 350) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void writeRecordsNow(), delay);
}

if (typeof window !== "undefined") {
  window.addEventListener("scroll", () => {
    lastScrollTop = document.scrollingElement?.scrollTop ?? window.scrollY ?? 0;
  }, { passive: true });
}

function syncSummaryAndRows() {
  let rawDone = 0;
  logs.forEach((log, index) => {
    rawDone += Math.max(0, amountValue(log.amount));
    const capped = total ? Math.min(rawDone, total) : rawDone;
    const rowPct = total ? Math.round(capped / total * 100) : 0;
    const row = tbodyEl.querySelector(`tr[data-index="${index}"]`);
    if (row) {
      const cumulativeEl = row.querySelector(".pp-cumulative");
      const rowPctEl = row.querySelector(".pp-row-pct");
      if (cumulativeEl) cumulativeEl.textContent = `${cleanNumber(capped)}/${cleanNumber(total)} ${unit}`;
      if (rowPctEl) rowPctEl.textContent = `${rowPct}%`;
    }
  });

  const done = total ? Math.min(rawDone, total) : rawDone;
  const remaining = total ? Math.max(total - done, 0) : 0;
  const pct = total ? Math.round(done / total * 100) : 0;
  doneEl.textContent = `${cleanNumber(done)}/${cleanNumber(total)}`;
  pctEl.textContent = `${pct}%`;
  remainingEl.textContent = `${cleanNumber(remaining)} ${unit}`;
  countEl.textContent = String(logs.length);
  fillEl.style.width = `${Math.max(0, Math.min(pct, 100))}%`;
  fillEl.style.background = progressFillStyle(currentBarColor, pct);

  const showWarning = Boolean(total && rawDone > total);
  warningEl.style.display = showWarning ? "" : "none";
  if (showWarning) {
    warningEl.textContent = `记录总量已经超过任务总量 ${cleanNumber(rawDone - total)} ${unit}，进度按 100% 显示。`;
  }
}

function rowHtml(log, index) {
  return `
    <tr data-index="${index}" data-id="${esc(log.id)}">
      <td><input class="pp-input" type="datetime-local" data-field="recorded" data-index="${index}" value="${esc(dateInputValue(log.recorded))}"></td>
      <td><input class="pp-input" type="number" min="1" step="1" data-field="amount" data-index="${index}" value="${esc(log.amount)}"></td>
      <td><input class="pp-input" type="text" data-field="note" data-index="${index}" value="${esc(log.note)}" placeholder="备注"></td>
      <td class="pp-cumulative"></td>
      <td class="pp-row-pct"></td>
      <td><button type="button" class="pp-icon-btn" data-action="delete" data-index="${index}" title="删除这条记录" aria-label="删除这条记录"></button></td>
    </tr>
  `;
}

function renderTable(focus = null) {
  sortLogs();
  if (!logs.length) {
    tbodyEl.innerHTML = `<tr><td colspan="6" class="pp-muted">还没有进度记录。点击左上角 + 添加第一条。</td></tr>`;
    syncSummaryAndRows();
    return;
  }

  tbodyEl.innerHTML = logs.map(rowHtml).join("");
  tbodyEl.querySelectorAll("[data-action='delete']").forEach(button => {
    if (typeof setIcon === "function") setIcon(button, "trash-2");
    else button.textContent = "x";
  });
  syncSummaryAndRows();

  if (focus?.id) {
    requestAnimationFrame(() => {
      const cssEscape = globalThis.CSS?.escape ?? (value => String(value).replace(/["\\]/g, "\\$&"));
      const row = tbodyEl.querySelector(`tr[data-id="${cssEscape(focus.id)}"]`);
      const target = row?.querySelector(`[data-field="${focus.field ?? "amount"}"]`);
      if (target) {
        if (tableWrapEl && row) {
          tableWrapEl.scrollTop = Math.max(0, row.offsetTop - tableWrapEl.clientHeight + row.offsetHeight + 10);
        }
        target.focus({ preventScroll: true });
        if (typeof target.select === "function") target.select();
      }
    });
  }
}

addBtn.addEventListener("click", () => {
  const record = {
    id: makeId(),
    recorded: stampNow(),
    amount: 1,
    note: ""
  };
  logs.push(record);
  renderTable({ id: record.id, field: "amount" });
  scheduleSave(80);
});

if (colorEl) {
  colorEl.addEventListener("input", () => {
    currentBarColor = normalizeHexColor(colorEl.value, currentBarColor);
    syncSummaryAndRows();
    scheduleSave(120);
  });

  colorEl.addEventListener("change", () => {
    currentBarColor = normalizeHexColor(colorEl.value, currentBarColor);
    syncSummaryAndRows();
    scheduleSave(40);
  });
}

tbodyEl.addEventListener("input", event => {
  const input = event.target.closest("[data-field]");
  if (!input) return;
  const index = Number(input.dataset.index);
  const field = input.dataset.field;
  const record = logs[index];
  if (!record) return;

  if (field === "amount") {
    record.amount = input.value === "" ? 0 : amountValue(input.value);
    syncSummaryAndRows();
  } else if (field === "note") {
    record.note = input.value;
  } else if (field === "recorded") {
    record.recorded = input.value;
  }

  scheduleSave();
});

tbodyEl.addEventListener("change", event => {
  const input = event.target.closest("[data-field]");
  if (!input) return;
  const index = Number(input.dataset.index);
  const record = logs[index];
  if (!record) return;

  if (input.dataset.field === "recorded") {
    record.recorded = dateInputValue(input.value) || stampNow();
    renderTable({ id: record.id, field: "recorded" });
    scheduleSave(80);
  }
});

tbodyEl.addEventListener("focusout", event => {
  const input = event.target.closest("[data-field='amount']");
  if (!input) return;
  const index = Number(input.dataset.index);
  const record = logs[index];
  if (!record) return;
  if (amountValue(record.amount) < 1) {
    record.amount = 1;
    input.value = "1";
    syncSummaryAndRows();
    scheduleSave(80);
  }
});

tbodyEl.addEventListener("click", event => {
  const button = event.target.closest("[data-action='delete']");
  if (!button) return;
  const index = Number(button.dataset.index);
  if (!logs[index]) return;
  logs.splice(index, 1);
  renderTable();
  scheduleSave(80);
});

renderTable();

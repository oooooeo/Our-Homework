const projects = dv.pages('"Projects"')
  .where(p => p.type === "progress-project");

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

function progressTrackStyle(color, pct = 0) {
  const safePct = Math.max(0, Math.min(pct, 100));
  if (safePct <= 0) return "transparent";
  const { r, g, b } = hexToRgb(color);
  const alpha = safePct / 100;
  return `linear-gradient(90deg, rgba(${r}, ${g}, ${b}, 0) 0%, rgba(${r}, ${g}, ${b}, ${alpha}) ${safePct}%, transparent ${safePct}%, transparent 100%)`;
}

function amountValue(value) {
  const n = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function cleanNumber(value) {
  const n = amountValue(value);
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
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

function recordLabel(value) {
  const normalized = dateInputValue(value);
  return normalized ? normalized.replace("T", " ") : "未记录";
}

function recordDay(value) {
  const normalized = dateInputValue(value);
  return normalized ? normalized.slice(0, 10) : "未记录日期";
}

function sortStamp(value) {
  const normalized = dateInputValue(value);
  const time = new Date(normalized).getTime();
  return Number.isFinite(time) ? time : 0;
}

function linkTo(item) {
  return `<a class="internal-link" href="${esc(item.path)}" data-href="${esc(item.path)}">${esc(item.name)}</a>`;
}

function projectLogs(page) {
  return toArray(fieldValue(page, ["progressRecords", "progressrecords", "progress-records"]))
    .map(record => ({
      recorded: record.recorded,
      amount: Math.max(0, amountValue(record.amount)),
      note: record.note ?? ""
    }))
    .sort((a, b) => sortStamp(a.recorded) - sortStamp(b.recorded));
}

const items = projects.array().map(page => {
  const logs = projectLogs(page);
  const total = Number(page.total ?? 0);
  const barColor = normalizeHexColor(fieldValue(page, ["progressBarColor", "progressbarcolor", "progress-bar-color"]));
  const rawDone = logs.reduce((sum, log) => sum + log.amount, 0);
  const done = total ? Math.min(rawDone, total) : rawDone;
  const pct = total ? Math.round(done / total * 100) : 0;
  const remaining = total ? Math.max(total - done, 0) : 0;

  return {
    page,
    name: page.file.name,
    path: page.file.path,
    status: page.status ?? "active",
    unit: page.unit ?? "份",
    total,
    rawDone,
    done,
    remaining,
    pct,
    logs,
    barColor
  };
}).sort((a, b) => b.pct - a.pct);

const totalCapacity = items.reduce((sum, item) => sum + item.total, 0);
const totalDone = items.reduce((sum, item) => sum + item.done, 0);
const overallPct = totalCapacity ? Math.round(totalDone / totalCapacity * 100) : 0;
const activeCount = items.filter(item => item.pct < 100 && String(item.status) !== "done").length;

const allLogs = items.flatMap(item => item.logs.map(log => ({
  ...log,
  project: item
}))).sort((a, b) => sortStamp(b.recorded) - sortStamp(a.recorded));

const recentLogs = allLogs.slice(0, 8);

const daily = new Map();
for (const log of allLogs) {
  const day = recordDay(log.recorded);
  daily.set(day, (daily.get(day) ?? 0) + log.amount);
}

function dayOffset(offset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const heatDays = Array.from({ length: 35 }, (_, i) => dayOffset(34 - i));
const heatMax = Math.max(1, ...heatDays.map(day => daily.get(day) ?? 0));
const heatHtml = heatDays.map(day => {
  const count = daily.get(day) ?? 0;
  const level = count === 0 ? 0 : Math.max(1, Math.ceil(count / heatMax * 4));
  return `<span class="pd-day level-${level}" title="${day}: ${cleanNumber(count)}"></span>`;
}).join("");

const projectRows = items.map(item => `
  <tr>
    <td>${linkTo(item)}</td>
    <td>${esc(cleanNumber(item.done))}/${esc(cleanNumber(item.total))} ${esc(item.unit)}</td>
    <td>${esc(cleanNumber(item.remaining))} ${esc(item.unit)}</td>
    <td class="pd-pct">${esc(item.pct)}%</td>
    <td>
      <div class="pd-bar" aria-label="${esc(item.name)} ${esc(item.pct)}%">
        <div class="pd-fill" data-pct="${esc(item.pct)}" data-color="${esc(item.barColor)}"></div>
      </div>
    </td>
  </tr>
`).join("");

const barRows = items.map(item => `
  <div class="pd-chart-row">
    <div class="pd-chart-name">${linkTo(item)}</div>
    <div class="pd-chart-bar">
      <div class="pd-chart-fill" data-pct="${esc(item.pct)}" data-color="${esc(item.barColor)}"></div>
    </div>
    <div class="pd-chart-value">${esc(item.pct)}%</div>
  </div>
`).join("");

const recentRows = recentLogs.length
  ? recentLogs.map(log => `
      <tr>
        <td>${esc(recordLabel(log.recorded))}</td>
        <td>${linkTo(log.project)}</td>
        <td>${esc(cleanNumber(log.amount))} ${esc(log.project.unit)}</td>
        <td>${esc(log.note)}</td>
      </tr>
    `).join("")
  : `<tr><td colspan="4" class="pd-muted">还没有进度记录。</td></tr>`;

const style = document.createElement("style");
style.textContent = `
  .pd-wrap { display: grid; gap: 22px; }
  .pd-section-title { margin: 18px 0 8px; font-size: 1.18em; font-weight: 700; }
  .pd-card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .pd-card { border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 12px; background: var(--background-primary-alt); }
  .pd-card-label { color: var(--text-muted); font-size: 0.82em; }
  .pd-card-value { font-size: 1.55em; font-weight: 750; margin-top: 4px; }
  .pd-table { width: 100%; border-collapse: collapse; }
  .pd-table th, .pd-table td { border-bottom: 1px solid var(--background-modifier-border); padding: 8px 6px; text-align: left; vertical-align: middle; }
  .pd-table th { color: var(--text-muted); font-size: 0.84em; font-weight: 650; }
  .pd-pct { font-weight: 700; white-space: nowrap; }
  .pd-bar, .pd-chart-bar { height: 10px; background: transparent; border: 1px solid var(--background-modifier-border); border-radius: 999px; overflow: hidden; min-width: 120px; }
  .pd-fill, .pd-chart-fill { display: block; height: 100%; min-height: 100%; border-radius: 999px; transition: width 120ms ease, background 120ms ease; }
  .pd-chart-row { display: grid; grid-template-columns: minmax(130px, 180px) 1fr 48px; gap: 10px; align-items: center; margin: 10px 0; }
  .pd-chart-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pd-heat { display: grid; grid-template-columns: repeat(35, 13px); gap: 4px; align-items: center; overflow-x: auto; padding-bottom: 2px; }
  .pd-day { width: 13px; height: 13px; border-radius: 3px; background: var(--background-modifier-border); display: inline-block; }
  .pd-day.level-1 { background: #b7d8ff; }
  .pd-day.level-2 { background: #6ab7ff; }
  .pd-day.level-3 { background: #2f80ed; }
  .pd-day.level-4 { background: #1f6f43; }
  .pd-muted { color: var(--text-muted); }
`;
dv.container.appendChild(style);

const wrap = document.createElement("div");
wrap.className = "pd-wrap";
wrap.innerHTML = items.length ? `
  <div class="pd-card-grid">
    <div class="pd-card">
      <div class="pd-card-label">任务数</div>
      <div class="pd-card-value">${esc(items.length)}</div>
    </div>
    <div class="pd-card">
      <div class="pd-card-label">进行中</div>
      <div class="pd-card-value">${esc(activeCount)}</div>
    </div>
    <div class="pd-card">
      <div class="pd-card-label">总体进度</div>
      <div class="pd-card-value">${esc(overallPct)}%</div>
    </div>
    <div class="pd-card">
      <div class="pd-card-label">累计完成</div>
      <div class="pd-card-value">${esc(cleanNumber(totalDone))}/${esc(cleanNumber(totalCapacity))}</div>
    </div>
  </div>

  <div>
    <div class="pd-section-title">项目进度</div>
    <table class="pd-table">
      <thead>
        <tr>
          <th>任务</th>
          <th>已完成</th>
          <th>剩余</th>
          <th>百分比</th>
          <th>进度条</th>
        </tr>
      </thead>
      <tbody>${projectRows}</tbody>
    </table>
  </div>

  <div>
    <div class="pd-section-title">进度对比</div>
    ${barRows}
  </div>

  <div>
    <div class="pd-section-title">最近记录</div>
    <table class="pd-table">
      <thead>
        <tr>
          <th>时间</th>
          <th>任务</th>
          <th>完成量</th>
          <th>备注</th>
        </tr>
      </thead>
      <tbody>${recentRows}</tbody>
    </table>
  </div>

  <div>
    <div class="pd-section-title">近 35 天完成热力</div>
    <div class="pd-heat">${heatHtml}</div>
  </div>
` : `
  <p class="pd-muted">还没有任务。到 <code>Projects/</code> 文件夹中新建一个任务笔记，或使用 <code>Templates/进度项目模板.md</code>。</p>
`;

dv.container.appendChild(wrap);

wrap.querySelectorAll(".pd-fill, .pd-chart-fill").forEach(fill => {
  const pct = Math.max(0, Math.min(Number(fill.dataset.pct ?? 0), 100));
  const color = normalizeHexColor(fill.dataset.color);
  const track = fill.closest(".pd-bar, .pd-chart-bar");
  fill.style.width = `${pct}%`;
  fill.style.background = progressFillStyle(color, pct);
  if (track) track.style.background = progressTrackStyle(color, pct);
});

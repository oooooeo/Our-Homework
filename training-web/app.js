const TrainingStore = (() => {
  const SUPABASE_URL = "https://cawfwgfsarqsfsmfxrni.supabase.co";
  const SUPABASE_KEY = "sb_publishable_V0aQMFDHrQfhmkGMRIRNWQ_EMUImp4-";
  const CHANNEL_NAME = "employee-training-updates";
  const ACCENT = "#1f75cb";
  const REFRESH_INTERVAL_MS = 5000;

  let state = {
    employees: [],
    tasks: [],
    completions: [],
    loading: true,
    error: ""
  };

  const listeners = new Set();
  const channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;
  let refreshTimer = null;

  function getState() {
    return state;
  }

  function setState(nextState) {
    state = { ...state, ...nextState };
    notify();
  }

  function notify() {
    listeners.forEach(listener => listener(getState()));
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  async function request(path, options = {}) {
    const headers = {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    };

    const response = await fetch(`${SUPABASE_URL}${path}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      const message = await response.text();
      const error = new Error(message || `Supabase request failed: ${response.status}`);
      error.status = response.status;
      throw error;
    }

    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function loadRemoteState({ silent = false } = {}) {
    if (!silent) setState({ loading: true, error: "" });

    try {
      const [employees, tasks, completions] = await Promise.all([
        request("/rest/v1/employees?select=id,code,name,department,role&order=code.asc"),
        request("/rest/v1/training_tasks?select=id,code,title,type,minutes,content,created_at&order=created_at.asc"),
        request("/rest/v1/training_completions?select=id,employee_id,task_id,completed_at&order=completed_at.asc")
      ]);

      setState({
        employees: employees ?? [],
        tasks: (tasks ?? []).map(task => ({
          ...task,
          content: Array.isArray(task.content) ? task.content : []
        })),
        completions: (completions ?? []).map(record => ({
          id: record.id,
          employeeId: record.employee_id,
          taskId: record.task_id,
          completedAt: record.completed_at
        })),
        loading: false,
        error: ""
      });
    } catch (error) {
      console.error(error);
      setState({
        loading: false,
        error: "无法连接 Supabase，请检查表结构、权限或网络。"
      });
    }
  }

  function startAutoRefresh() {
    if (refreshTimer) return;
    refreshTimer = window.setInterval(() => {
      void loadRemoteState({ silent: true });
    }, REFRESH_INTERVAL_MS);
  }

  function isComplete(employeeId, taskId) {
    return state.completions.some(item => item.employeeId === employeeId && item.taskId === taskId);
  }

  function employeeCompletions(employeeId) {
    return state.completions.filter(item => item.employeeId === employeeId);
  }

  function taskCompletions(taskId) {
    return state.completions.filter(item => item.taskId === taskId);
  }

  async function completeTask(employeeId, taskId) {
    if (!employeeId || !taskId || isComplete(employeeId, taskId)) return;

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/training_completions`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          employee_id: employeeId,
          task_id: taskId
        })
      });

      if (!response.ok && response.status !== 409) {
        throw new Error(await response.text());
      }

      channel?.postMessage({ type: "state-updated" });
      await loadRemoteState({ silent: true });
    } catch (error) {
      console.error(error);
      setState({ error: "完成记录保存失败，请稍后重试。" });
    }
  }

  async function createTask({ title, content }) {
    const trimmedTitle = String(title ?? "").trim();
    const trimmedContent = String(content ?? "").trim();
    if (!trimmedTitle || !trimmedContent) return null;

    const rows = await request("/rest/v1/training_tasks?select=id,code,title,type,minutes,content,created_at", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        code: `task-${Date.now().toString(36)}`,
        title: trimmedTitle,
        type: "培训文章",
        minutes: Math.max(3, Math.ceil(trimmedContent.length / 120)),
        content: trimmedContent.split(/\n+/).map(item => item.trim()).filter(Boolean)
      })
    });

    channel?.postMessage({ type: "state-updated" });
    await loadRemoteState({ silent: true });
    return Array.isArray(rows) ? rows[0] : null;
  }

  function percent(done, total) {
    return total ? Math.round(done / total * 100) : 0;
  }

  function formatTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    const pad = n => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function hexToRgb(hex) {
    const match = String(hex).match(/^#([0-9a-f]{6})$/i);
    if (!match) return { r: 31, g: 117, b: 203 };
    const raw = match[1];
    return {
      r: Number.parseInt(raw.slice(0, 2), 16),
      g: Number.parseInt(raw.slice(2, 4), 16),
      b: Number.parseInt(raw.slice(4, 6), 16)
    };
  }

  function progressFillStyle(color, pct = 100) {
    const rgb = hexToRgb(color);
    const alpha = Math.max(0, Math.min(pct, 100)) / 100;
    return `linear-gradient(90deg, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0) 0%, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha}) 100%)`;
  }

  function progressTrackStyle(color, pct = 0) {
    const safePct = Math.max(0, Math.min(pct, 100));
    if (safePct <= 0) return "transparent";
    const rgb = hexToRgb(color);
    const alpha = safePct / 100;
    return `linear-gradient(90deg, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0) 0%, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha}) ${safePct}%, transparent ${safePct}%, transparent 100%)`;
  }

  function setProgress(element, pct, color = ACCENT) {
    if (!element) return;
    const safePct = Math.max(0, Math.min(Number(pct) || 0, 100));
    const track = element.closest(".progress-track");
    element.style.width = `${safePct}%`;
    element.style.background = progressFillStyle(color, safePct);
    if (track) track.style.background = progressTrackStyle(color, safePct);
  }

  channel?.addEventListener("message", message => {
    if (message.data?.type !== "state-updated") return;
    void loadRemoteState({ silent: true });
  });

  window.addEventListener("focus", () => {
    void loadRemoteState({ silent: true });
  });

  void loadRemoteState();
  startAutoRefresh();

  return {
    getState,
    subscribe,
    loadRemoteState,
    isComplete,
    employeeCompletions,
    taskCompletions,
    completeTask,
    createTask,
    percent,
    formatTime,
    esc,
    setProgress
  };
})();

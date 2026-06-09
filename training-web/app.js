const TrainingStore = (() => {
  const SUPABASE_URL = "https://cawfwgfsarqsfsmfxrni.supabase.co";
  const SUPABASE_KEY = "sb_publishable_V0aQMFDHrQfhmkGMRIRNWQ_EMUImp4-";
  const CHANNEL_NAME = "employee-training-updates";
  const ACCENT = "#1f75cb";
  const REFRESH_INTERVAL_MS = 5000;
  const SESSION_KEY = "training-auth-session";
  const MANAGER_USERNAME = "supermanager";

  let state = {
    employees: [],
    tasks: [],
    completions: [],
    comments: [],
    schema: {
      dueAt: true,
      comments: true
    },
    loading: true,
    error: "",
    databaseNotice: ""
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

  function normalizeUsername(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  function isValidUsername(value) {
    const username = normalizeUsername(value);
    return /^[a-z0-9_-]{2,32}$/.test(username);
  }

  function getSession() {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setSession(session) {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({
      ...session,
      username: normalizeUsername(session.username),
      savedAt: new Date().toISOString()
    }));
  }

  function clearSession() {
    window.localStorage.removeItem(SESSION_KEY);
  }

  function isManagerSession() {
    const session = getSession();
    return session?.role === "manager" && session.username === MANAGER_USERNAME;
  }

  function isEmployeeSession() {
    const session = getSession();
    return session?.role === "employee" && Boolean(session.username);
  }

  function sessionEmployee() {
    const session = getSession();
    if (!session || session.role !== "employee") return null;
    return state.employees.find(employee => employee.id === session.employeeId || employee.code === session.username) ?? null;
  }

  function databaseAuthNotice() {
    return "如果是首次启用用户名注册，请先在 Supabase SQL Editor 执行用户名登录升级 SQL。";
  }

  function isSchemaCacheError(error, keyword) {
    const message = String(error?.message ?? "").toLowerCase();
    return message.includes(String(keyword).toLowerCase()) && (
      message.includes("schema cache") ||
      message.includes("column") ||
      message.includes("relation") ||
      message.includes("table")
    );
  }

  function normalizeTask(task) {
    return {
      ...task,
      content: Array.isArray(task.content) ? task.content : [],
      dueAt: task.due_at ?? null,
      createdAt: task.created_at
    };
  }

  function normalizeCompletion(record) {
    return {
      id: record.id,
      employeeId: record.employee_id,
      taskId: record.task_id,
      completedAt: record.completed_at
    };
  }

  function normalizeComment(record) {
    return {
      id: record.id,
      taskId: record.task_id,
      employeeId: record.employee_id,
      body: record.body,
      createdAt: record.created_at
    };
  }

  function schemaNotice(schema) {
    const missing = [];
    if (!schema.dueAt) missing.push("任务截止时间");
    if (!schema.comments) missing.push("任务评论区");
    return missing.length
      ? `数据库还没有启用：${missing.join("、")}。请先在 Supabase SQL Editor 执行仓库中的升级 SQL。`
      : "";
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

  async function lookupEmployeeByUsername(username) {
    const normalized = normalizeUsername(username);
    const rows = await request(`/rest/v1/employees?select=id,code,name,department,role&code=eq.${encodeURIComponent(normalized)}&limit=1`);
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  async function createEmployeeByUsername(username) {
    const normalized = normalizeUsername(username);
    const rows = await request("/rest/v1/employees?select=id,code,name,department,role", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        code: normalized,
        name: normalized,
        department: "自助注册",
        role: "员工"
      })
    });
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  async function loginOrRegister(username) {
    const normalized = normalizeUsername(username);
    if (!isValidUsername(normalized)) {
      throw new Error("用户名只能使用 2-32 位小写字母、数字、下划线或短横线。");
    }

    if (normalized === MANAGER_USERNAME) {
      setSession({ role: "manager", username: normalized });
      return { role: "manager", username: normalized, status: "logged-in" };
    }

    let employee = await lookupEmployeeByUsername(normalized);
    let status = "logged-in";

    if (!employee) {
      try {
        employee = await createEmployeeByUsername(normalized);
        status = "registered";
      } catch (error) {
        if (error.status === 409) {
          employee = await lookupEmployeeByUsername(normalized);
          status = "logged-in";
        } else if (error.status === 401 || error.status === 403 || error.status === 404) {
          throw new Error(`当前数据库还不允许自助注册。${databaseAuthNotice()}`);
        } else {
          throw error;
        }
      }
    }

    if (!employee) {
      throw new Error("没有找到该用户名，也无法完成注册。请稍后重试。");
    }

    setSession({
      role: "employee",
      username: normalized,
      employeeId: employee.id
    });
    await loadRemoteState({ silent: true });
    return { role: "employee", username: normalized, employee, status };
  }

  async function loadTasksWithSchema() {
    try {
      const rows = await request("/rest/v1/training_tasks?select=id,code,title,type,minutes,content,due_at,created_at&order=created_at.asc");
      return {
        rows: rows ?? [],
        dueAt: true
      };
    } catch (error) {
      if (!isSchemaCacheError(error, "due_at")) throw error;
      const rows = await request("/rest/v1/training_tasks?select=id,code,title,type,minutes,content,created_at&order=created_at.asc");
      return {
        rows: rows ?? [],
        dueAt: false
      };
    }
  }

  async function loadCommentsWithSchema() {
    try {
      const rows = await request("/rest/v1/task_comments?select=id,task_id,employee_id,body,created_at&order=created_at.asc");
      return {
        rows: rows ?? [],
        comments: true
      };
    } catch (error) {
      if (!isSchemaCacheError(error, "task_comments")) throw error;
      return {
        rows: [],
        comments: false
      };
    }
  }

  async function loadRemoteState({ silent = false } = {}) {
    if (!silent) setState({ loading: true, error: "" });

    try {
      const [employees, taskResult, completions, commentResult] = await Promise.all([
        request("/rest/v1/employees?select=id,code,name,department,role&order=code.asc"),
        loadTasksWithSchema(),
        request("/rest/v1/training_completions?select=id,employee_id,task_id,completed_at&order=completed_at.asc"),
        loadCommentsWithSchema()
      ]);
      const schema = {
        dueAt: taskResult.dueAt,
        comments: commentResult.comments
      };

      setState({
        employees: employees ?? [],
        tasks: taskResult.rows.map(normalizeTask),
        completions: (completions ?? []).map(normalizeCompletion),
        comments: commentResult.rows.map(normalizeComment),
        schema,
        loading: false,
        error: "",
        databaseNotice: schemaNotice(schema)
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

  function taskComments(taskId) {
    return state.comments.filter(item => item.taskId === taskId);
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

  function normalizeDueAt(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }

  async function createTask({ title, content, dueAt }) {
    const trimmedTitle = String(title ?? "").trim();
    const trimmedContent = String(content ?? "").trim();
    const normalizedDueAt = normalizeDueAt(dueAt);
    if (!trimmedTitle || !trimmedContent) return null;
    if (dueAt && !normalizedDueAt) {
      throw new Error("截止时间格式不正确。");
    }
    if (normalizedDueAt && state.schema.dueAt === false) {
      throw new Error("数据库还没有启用任务截止时间，请先执行升级 SQL。");
    }

    const payload = {
      code: `task-${Date.now().toString(36)}`,
      title: trimmedTitle,
      type: "培训文章",
      minutes: Math.max(3, Math.ceil(trimmedContent.length / 120)),
      content: trimmedContent.split(/\n+/).map(item => item.trim()).filter(Boolean)
    };
    if (normalizedDueAt) payload.due_at = normalizedDueAt;

    const select = state.schema.dueAt === false
      ? "id,code,title,type,minutes,content,created_at"
      : "id,code,title,type,minutes,content,due_at,created_at";
    const rows = await request(`/rest/v1/training_tasks?select=${select}`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload)
    });

    channel?.postMessage({ type: "state-updated" });
    await loadRemoteState({ silent: true });
    return Array.isArray(rows) ? normalizeTask(rows[0]) : null;
  }

  async function createComment({ taskId, employeeId, body }) {
    const trimmedBody = String(body ?? "").trim();
    if (!taskId || !employeeId || !trimmedBody) return null;
    if (state.schema.comments === false) {
      throw new Error("数据库还没有启用任务评论区，请先执行升级 SQL。");
    }

    const rows = await request("/rest/v1/task_comments?select=id,task_id,employee_id,body,created_at", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        task_id: taskId,
        employee_id: employeeId,
        body: trimmedBody
      })
    });

    channel?.postMessage({ type: "state-updated" });
    await loadRemoteState({ silent: true });
    return Array.isArray(rows) ? normalizeComment(rows[0]) : null;
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

  function formatRelativeDeadline(value) {
    if (!value) return "未设置";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "未设置";
    const diff = date.getTime() - Date.now();
    const absHours = Math.ceil(Math.abs(diff) / 36e5);
    if (diff < 0) {
      if (absHours < 24) return `已逾期 ${absHours} 小时`;
      return `已逾期 ${Math.ceil(absHours / 24)} 天`;
    }
    if (absHours < 24) return `${absHours} 小时后截止`;
    return `${Math.ceil(absHours / 24)} 天后截止`;
  }

  function deadlineStatus(task, complete = false) {
    if (!task?.dueAt) {
      return {
        level: "none",
        label: "未设置截止时间",
        detail: "未设置",
        urgent: false
      };
    }

    const dueTime = new Date(task.dueAt).getTime();
    if (Number.isNaN(dueTime)) {
      return {
        level: "none",
        label: "截止时间异常",
        detail: "未设置",
        urgent: false
      };
    }

    const diff = dueTime - Date.now();
    const detail = formatRelativeDeadline(task.dueAt);
    if (complete) {
      return {
        level: "done",
        label: `已完成，截止 ${formatTime(task.dueAt)}`,
        detail,
        urgent: false
      };
    }
    if (diff < 0) {
      return {
        level: "overdue",
        label: `已逾期，截止 ${formatTime(task.dueAt)}`,
        detail,
        urgent: true
      };
    }
    if (diff <= 48 * 36e5) {
      return {
        level: "soon",
        label: `即将截止：${formatTime(task.dueAt)}`,
        detail,
        urgent: true
      };
    }
    return {
      level: "normal",
      label: `截止 ${formatTime(task.dueAt)}`,
      detail,
      urgent: false
    };
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
    normalizeUsername,
    isValidUsername,
    getSession,
    setSession,
    clearSession,
    isManagerSession,
    isEmployeeSession,
    sessionEmployee,
    loginOrRegister,
    isComplete,
    employeeCompletions,
    taskCompletions,
    taskComments,
    completeTask,
    createTask,
    createComment,
    percent,
    formatTime,
    formatRelativeDeadline,
    deadlineStatus,
    esc,
    setProgress
  };
})();

const TrainingStore = (() => {
  const SUPABASE_URL = "https://cawfwgfsarqsfsmfxrni.supabase.co";
  const SUPABASE_KEY = "sb_publishable_V0aQMFDHrQfhmkGMRIRNWQ_EMUImp4-";
  const CHANNEL_NAME = "employee-training-updates";
  const ACCENT = "#1f75cb";
  const REFRESH_INTERVAL_MS = 5000;
  const SESSION_KEY = "training-auth-session";
  const MANAGER_USERNAME = "supermanager";
  const DEPARTMENTS = ["人力资源部", "财务部", "市场部", "销售部", "技术部", "运营部"];

  let state = {
    employees: [],
    tasks: [],
    completions: [],
    comments: [],
    feedback: [],
    questions: [],
    schema: {
      dueAt: true,
      comments: true,
      targetDepartments: true,
      feedback: true,
      questions: true
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
    return "如果是首次启用密码登录，请先在 Supabase SQL Editor 执行密码登录升级 SQL。";
  }

  function employeeAdminNotice() {
    return "请先在 Supabase SQL Editor 执行 training-web/supabase-migration-20260610-employee-department-delete.sql。";
  }

  function targetDepartmentsNotice() {
    return "请先在 Supabase SQL Editor 执行 training-web/supabase-migration-20260611-target-departments.sql。";
  }

  function feedbackNotice() {
    return "请先在 Supabase SQL Editor 执行 training-web/supabase-migration-20260611-feedback.sql。";
  }

  function questionsNotice() {
    return "请先在 Supabase SQL Editor 执行 training-web/supabase-migration-20260611-public-questions.sql。";
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
      targetDepartments: normalizeTargetDepartments(task.target_departments),
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

  function normalizeFeedback(record) {
    return {
      id: record.id,
      employeeId: record.employee_id,
      taskId: record.task_id,
      type: record.feedback_type,
      body: record.body,
      createdAt: record.created_at
    };
  }

  function normalizeQuestion(record) {
    return {
      id: record.id,
      employeeId: record.employee_id,
      taskId: record.task_id,
      title: record.title,
      body: record.body,
      topic: record.topic,
      status: record.status,
      answerBody: record.answer_body,
      answeredBy: record.answered_by,
      answeredAt: record.answered_at,
      viewCount: record.view_count ?? 0,
      createdAt: record.created_at,
      updatedAt: record.updated_at
    };
  }

  function schemaNotice(schema) {
    const missing = [];
    if (!schema.dueAt) missing.push("任务截止时间");
    if (!schema.comments) missing.push("任务评论区");
    if (!schema.targetDepartments) missing.push("任务目标部门");
    if (!schema.feedback) missing.push("员工反馈");
    if (!schema.questions) missing.push("公开问题库");
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

  function isValidPassword(value) {
    return String(value ?? "").length >= 6;
  }

  function normalizeDepartment(value) {
    return DEPARTMENTS.includes(value) ? value : DEPARTMENTS[0];
  }

  function normalizeTargetDepartments(value) {
    const departments = Array.isArray(value)
      ? value
      : String(value ?? "")
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);
    const filtered = departments.filter(department => DEPARTMENTS.includes(department));
    return filtered.length ? [...new Set(filtered)] : [...DEPARTMENTS];
  }

  function normalizeAuthResult(row, status) {
    const role = row?.role;
    const username = normalizeUsername(row?.username);
    const employeeId = row?.employee_id ?? null;
    setSession({ role, username, employeeId });
    return {
      role,
      username,
      employeeId,
      status,
      employee: employeeId ? {
        id: employeeId,
        code: username,
        name: row.employee_name ?? username,
        department: row.department ?? "自助注册",
        role: "员工"
      } : null
    };
  }

  async function callAuthFunction(name, username, password, extraPayload = {}) {
    const rows = await request(`/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        input_username: normalizeUsername(username),
        input_password: String(password ?? ""),
        ...extraPayload
      })
    });
    return Array.isArray(rows) ? rows[0] ?? null : rows;
  }

  async function login(username, password) {
    const normalized = normalizeUsername(username);
    if (!isValidUsername(normalized)) {
      throw new Error("用户名只能使用 2-32 位小写字母、数字、下划线或短横线。");
    }
    if (!isValidPassword(password)) {
      throw new Error("密码至少需要 6 位。");
    }

    try {
      const row = await callAuthFunction("training_auth_login", normalized, password);
      if (!row) throw new Error("登录失败，请检查用户名和密码。");
      await loadRemoteState({ silent: true });
      return normalizeAuthResult(row, "logged-in");
    } catch (error) {
      if (error.status === 401 || error.status === 403 || error.status === 404) {
        throw new Error(`当前数据库还不支持密码登录。${databaseAuthNotice()}`);
      }
      throw error;
    }
  }

  async function register(username, password, department) {
    const normalized = normalizeUsername(username);
    const normalizedDepartment = normalizeDepartment(department);
    if (!isValidUsername(normalized)) {
      throw new Error("用户名只能使用 2-32 位小写字母、数字、下划线或短横线。");
    }
    if (!isValidPassword(password)) {
      throw new Error("密码至少需要 6 位。");
    }

    try {
      const row = await callAuthFunction("training_auth_register", normalized, password, {
        input_department: normalizedDepartment
      });
      if (!row) throw new Error("注册失败，请稍后重试。");
      await loadRemoteState({ silent: true });
      return normalizeAuthResult(row, "registered");
    } catch (error) {
      if (String(error.message ?? "").includes("input_department")) {
        throw new Error(`当前数据库还没有启用部门注册。${employeeAdminNotice()}`);
      }
      if (error.status === 401 || error.status === 403 || error.status === 404) {
        throw new Error(`当前数据库还不支持密码注册。${databaseAuthNotice()}`);
      }
      throw error;
    }
  }

  async function loadTasksWithSchema() {
    try {
      const rows = await request("/rest/v1/training_tasks?select=id,code,title,type,minutes,content,due_at,target_departments,created_at&order=created_at.asc");
      return {
        rows: rows ?? [],
        dueAt: true,
        targetDepartments: true
      };
    } catch (error) {
      if (!isSchemaCacheError(error, "target_departments") && !isSchemaCacheError(error, "due_at")) throw error;
      const fallback = await loadTasksWithDueAtSchema();
      return {
        ...fallback,
        targetDepartments: false
      };
    }
  }

  async function loadTasksWithDueAtSchema() {
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

  async function loadFeedbackWithSchema() {
    try {
      const rows = await request("/rest/v1/training_feedback?select=id,employee_id,task_id,feedback_type,body,created_at&order=created_at.desc");
      return {
        rows: rows ?? [],
        feedback: true
      };
    } catch (error) {
      if (!isSchemaCacheError(error, "training_feedback")) throw error;
      return {
        rows: [],
        feedback: false
      };
    }
  }

  async function loadQuestionsWithSchema() {
    try {
      const rows = await request("/rest/v1/training_questions?select=id,employee_id,task_id,title,body,topic,status,answer_body,answered_by,answered_at,view_count,created_at,updated_at&order=created_at.desc");
      return {
        rows: rows ?? [],
        questions: true
      };
    } catch (error) {
      if (!isSchemaCacheError(error, "training_questions")) throw error;
      return {
        rows: [],
        questions: false
      };
    }
  }

  async function loadRemoteState({ silent = false } = {}) {
    if (!silent) setState({ loading: true, error: "" });

    try {
      const [employees, taskResult, completions, commentResult, feedbackResult, questionResult] = await Promise.all([
        request("/rest/v1/employees?select=id,code,name,department,role&order=code.asc"),
        loadTasksWithSchema(),
        request("/rest/v1/training_completions?select=id,employee_id,task_id,completed_at&order=completed_at.asc"),
        loadCommentsWithSchema(),
        loadFeedbackWithSchema(),
        loadQuestionsWithSchema()
      ]);
      const schema = {
        dueAt: taskResult.dueAt,
        comments: commentResult.comments,
        targetDepartments: taskResult.targetDepartments,
        feedback: feedbackResult.feedback,
        questions: questionResult.questions
      };

      setState({
        employees: employees ?? [],
        tasks: taskResult.rows.map(normalizeTask),
        completions: (completions ?? []).map(normalizeCompletion),
        comments: commentResult.rows.map(normalizeComment),
        feedback: feedbackResult.rows.map(normalizeFeedback),
        questions: questionResult.rows.map(normalizeQuestion),
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

  function isTaskAssignedToDepartment(task, department) {
    return normalizeTargetDepartments(task?.targetDepartments).includes(normalizeDepartment(department));
  }

  function assignedTasksForEmployee(employee) {
    if (!employee) return [];
    return state.tasks.filter(task => isTaskAssignedToDepartment(task, employee.department));
  }

  function learningSquareTasksForEmployee(employee) {
    if (!employee) return [];
    return state.tasks.filter(task => !isTaskAssignedToDepartment(task, employee.department));
  }

  function employeeAssignedCompletions(employee) {
    const assignedIds = new Set(assignedTasksForEmployee(employee).map(task => task.id));
    return state.completions.filter(item => item.employeeId === employee?.id && assignedIds.has(item.taskId));
  }

  function assignedEmployeesForTask(task) {
    return state.employees.filter(employee => isTaskAssignedToDepartment(task, employee.department));
  }

  function taskAssignedCompletions(task) {
    const assignedEmployeeIds = new Set(assignedEmployeesForTask(task).map(employee => employee.id));
    return state.completions.filter(item => item.taskId === task?.id && assignedEmployeeIds.has(item.employeeId));
  }

  function requiredCapacity() {
    return state.employees.reduce((sum, employee) => sum + assignedTasksForEmployee(employee).length, 0);
  }

  function requiredCompletionCount() {
    const taskById = new Map(state.tasks.map(task => [task.id, task]));
    const employeeById = new Map(state.employees.map(employee => [employee.id, employee]));
    return state.completions.filter(record => {
      const task = taskById.get(record.taskId);
      const employee = employeeById.get(record.employeeId);
      return task && employee && isTaskAssignedToDepartment(task, employee.department);
    }).length;
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

  async function createTask({ title, content, dueAt, targetDepartments }) {
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
    const normalizedTargetDepartments = normalizeTargetDepartments(targetDepartments);
    if (state.schema.targetDepartments === false) {
      throw new Error(`数据库还没有启用任务目标部门。${targetDepartmentsNotice()}`);
    }

    const payload = {
      code: `task-${Date.now().toString(36)}`,
      title: trimmedTitle,
      type: "培训文章",
      minutes: Math.max(3, Math.ceil(trimmedContent.length / 120)),
      content: trimmedContent.split(/\n+/).map(item => item.trim()).filter(Boolean),
      target_departments: normalizedTargetDepartments
    };
    if (normalizedDueAt) payload.due_at = normalizedDueAt;

    const select = state.schema.dueAt === false
      ? "id,code,title,type,minutes,content,target_departments,created_at"
      : "id,code,title,type,minutes,content,due_at,target_departments,created_at";
    const rows = await request(`/rest/v1/training_tasks?select=${select}`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload)
    });

    channel?.postMessage({ type: "state-updated" });
    await loadRemoteState({ silent: true });
    return Array.isArray(rows) ? normalizeTask(rows[0]) : null;
  }

  async function deleteTask(taskId) {
    if (!taskId) return;
    const session = getSession();
    if (!isManagerSession()) {
      throw new Error("只有后台账号可以删除任务。");
    }

    await request("/rest/v1/rpc/training_delete_task", {
      method: "POST",
      body: JSON.stringify({
        input_task_id: taskId,
        input_username: session.username
      })
    });

    channel?.postMessage({ type: "state-updated" });
    await loadRemoteState({ silent: true });
  }

  async function deleteEmployee(employeeId) {
    if (!employeeId) return;
    const session = getSession();
    if (!isManagerSession()) {
      throw new Error("只有后台账号可以注销员工。");
    }

    try {
      await request("/rest/v1/rpc/training_delete_employee", {
        method: "POST",
        body: JSON.stringify({
          input_employee_id: employeeId,
          input_username: session.username
        })
      });
    } catch (error) {
      if (error.status === 401 || error.status === 403 || error.status === 404) {
        throw new Error(`当前数据库还没有启用后台注销员工。${employeeAdminNotice()}`);
      }
      throw error;
    }

    channel?.postMessage({ type: "state-updated" });
    await loadRemoteState({ silent: true });
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

  async function createFeedback({ taskId, employeeId, type, body }) {
    const normalizedType = ["like", "dislike", "suggestion"].includes(type) ? type : "suggestion";
    const trimmedBody = String(body ?? "").trim();
    if (!employeeId || !trimmedBody) return null;
    if (state.schema.feedback === false) {
      throw new Error(`数据库还没有启用员工反馈。${feedbackNotice()}`);
    }

    const payload = {
      employee_id: employeeId,
      feedback_type: normalizedType,
      body: trimmedBody
    };
    if (taskId) payload.task_id = taskId;

    const rows = await request("/rest/v1/training_feedback?select=id,employee_id,task_id,feedback_type,body,created_at", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload)
    });

    channel?.postMessage({ type: "state-updated" });
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  async function createQuestion({ taskId, employeeId, title, body, topic }) {
    const trimmedTitle = String(title ?? "").trim();
    const trimmedBody = String(body ?? "").trim();
    const trimmedTopic = String(topic ?? "").trim() || "系统使用";
    if (!employeeId || !trimmedTitle || !trimmedBody) return null;
    if (state.schema.questions === false) {
      throw new Error(`数据库还没有启用公开问题库。${questionsNotice()}`);
    }

    const payload = {
      employee_id: employeeId,
      title: trimmedTitle,
      body: trimmedBody,
      topic: trimmedTopic
    };
    if (taskId) payload.task_id = taskId;

    const rows = await request("/rest/v1/training_questions?select=id,employee_id,task_id,title,body,topic,status,answer_body,answered_by,answered_at,view_count,created_at,updated_at", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload)
    });

    channel?.postMessage({ type: "state-updated" });
    await loadRemoteState({ silent: true });
    return Array.isArray(rows) ? normalizeQuestion(rows[0]) : null;
  }

  async function answerQuestion({ questionId, answer, status = "answered" }) {
    const session = getSession();
    if (!isManagerSession()) {
      throw new Error("只有后台账号可以回复问题。");
    }
    if (state.schema.questions === false) {
      throw new Error(`数据库还没有启用公开问题库。${questionsNotice()}`);
    }

    await request("/rest/v1/rpc/training_answer_question", {
      method: "POST",
      body: JSON.stringify({
        input_question_id: questionId,
        input_username: session.username,
        input_answer: String(answer ?? ""),
        input_status: status
      })
    });

    channel?.postMessage({ type: "state-updated" });
    await loadRemoteState({ silent: true });
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
    isValidPassword,
    getSession,
    setSession,
    clearSession,
    departments: DEPARTMENTS,
    normalizeDepartment,
    normalizeTargetDepartments,
    isManagerSession,
    isEmployeeSession,
    sessionEmployee,
    login,
    register,
    isComplete,
    employeeCompletions,
    taskCompletions,
    taskComments,
    isTaskAssignedToDepartment,
    assignedTasksForEmployee,
    learningSquareTasksForEmployee,
    employeeAssignedCompletions,
    assignedEmployeesForTask,
    taskAssignedCompletions,
    requiredCapacity,
    requiredCompletionCount,
    completeTask,
    createTask,
    deleteTask,
    deleteEmployee,
    createComment,
    createFeedback,
    createQuestion,
    answerQuestion,
    percent,
    formatTime,
    formatRelativeDeadline,
    deadlineStatus,
    esc,
    setProgress
  };
})();

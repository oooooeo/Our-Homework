const TrainingStore = (() => {
  const STORAGE_KEY = "employee-training-state-v1";
  const CHANNEL_NAME = "employee-training-updates";
  const ACCENT = "#1f75cb";

  const initialState = {
    employees: [
      { id: "u-001", name: "张明", department: "销售部", role: "客户经理" },
      { id: "u-002", name: "李佳", department: "运营部", role: "运营专员" },
      { id: "u-003", name: "王晨", department: "产品部", role: "产品助理" },
      { id: "u-004", name: "赵宁", department: "客服部", role: "客服主管" }
    ],
    tasks: [
      {
        id: "t-001",
        title: "阅读《信息安全基础》",
        type: "培训文章",
        minutes: 8,
        content: [
          "员工在日常工作中需要保护客户资料、业务数据和公司内部文档。任何包含客户姓名、联系方式、订单信息、合同内容的数据，都应按内部资料处理。",
          "不要把业务资料转发到未经批准的个人设备或外部网盘。遇到陌生链接、异常附件、临时要求转账或索要验证码的消息，应先通过正式渠道确认。",
          "完成本篇培训后，员工应能识别常见信息安全风险，并在发现异常时及时上报。"
        ]
      },
      {
        id: "t-002",
        title: "阅读《客户沟通规范》",
        type: "培训文章",
        minutes: 6,
        content: [
          "客户沟通应保持准确、清晰、可追溯。涉及价格、交付周期、退款规则、服务承诺等内容时，应以公司当前政策和正式文档为准。",
          "遇到客户投诉时，先确认事实，再给出处理路径。不要在信息不足时做过度承诺，也不要把内部责任判断直接暴露给客户。",
          "完成本篇培训后，员工应能按照统一口径处理常见客户咨询。"
        ]
      },
      {
        id: "t-003",
        title: "阅读《入职合规手册》",
        type: "培训文章",
        minutes: 10,
        content: [
          "合规要求覆盖考勤、报销、数据使用、合同审批和对外沟通等工作环节。员工需要了解哪些事项可以自行处理，哪些事项必须走审批流程。",
          "所有报销和合同资料应保留真实凭证。涉及供应商、客户、合作伙伴的条款变更，应在系统中留痕，并由对应负责人确认。",
          "完成本篇培训后，员工应了解基本审批边界，并能在不确定时主动咨询。"
        ]
      }
    ],
    completions: []
  };

  let state = loadState();
  const listeners = new Set();
  const channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(initialState);

    try {
      const saved = JSON.parse(raw);
      return {
        employees: Array.isArray(saved.employees) ? saved.employees : initialState.employees,
        tasks: Array.isArray(saved.tasks) && saved.tasks.length ? saved.tasks : initialState.tasks,
        completions: Array.isArray(saved.completions) ? saved.completions : []
      };
    } catch {
      return clone(initialState);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    channel?.postMessage({ type: "state-updated" });
    notify();
  }

  function notify() {
    listeners.forEach(listener => listener(getState()));
  }

  function getState() {
    return state;
  }

  function reloadState() {
    state = loadState();
    notify();
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
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

  function completeTask(employeeId, taskId) {
    if (!employeeId || !taskId || isComplete(employeeId, taskId)) return;
    state.completions.push({
      employeeId,
      taskId,
      completedAt: new Date().toISOString()
    });
    saveState();
  }

  function createTask({ title, content }) {
    const trimmedTitle = String(title ?? "").trim();
    const trimmedContent = String(content ?? "").trim();
    if (!trimmedTitle || !trimmedContent) return null;

    const task = {
      id: `t-${Date.now().toString(36)}`,
      title: trimmedTitle,
      type: "培训文章",
      minutes: Math.max(3, Math.ceil(trimmedContent.length / 120)),
      content: trimmedContent.split(/\n+/).map(item => item.trim()).filter(Boolean)
    };

    state.tasks.push(task);
    saveState();
    return task;
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

  window.addEventListener("storage", event => {
    if (event.key !== STORAGE_KEY) return;
    reloadState();
  });

  channel?.addEventListener("message", message => {
    if (message.data?.type !== "state-updated") return;
    reloadState();
  });

  return {
    getState,
    subscribe,
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

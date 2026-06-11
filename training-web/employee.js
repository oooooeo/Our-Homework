const employeeEls = {
  currentUsername: document.querySelector("#currentUsername"),
  logoutBtn: document.querySelector("#logoutBtn"),
  feedbackOpenBtn: document.querySelector("#feedbackOpenBtn"),
  feedbackDrawer: document.querySelector("#feedbackDrawer"),
  feedbackOptions: document.querySelector("#feedbackOptions"),
  feedbackForm: document.querySelector("#feedbackForm"),
  feedbackBody: document.querySelector("#feedbackBody"),
  feedbackTask: document.querySelector("#feedbackTask"),
  feedbackMessage: document.querySelector("#feedbackMessage"),
  employeeDone: document.querySelector("#employeeDone"),
  employeePercent: document.querySelector("#employeePercent"),
  employeeProgress: document.querySelector("#employeeProgress"),
  databaseNotice: document.querySelector("#databaseNotice"),
  notificationList: document.querySelector("#notificationList"),
  taskPanelTitle: document.querySelector("#taskPanelTitle"),
  taskList: document.querySelector("#taskList"),
  articleTitle: document.querySelector("#articleTitle"),
  articleStatus: document.querySelector("#articleStatus"),
  articleBody: document.querySelector("#articleBody"),
  completeTaskBtn: document.querySelector("#completeTaskBtn"),
  commentCount: document.querySelector("#commentCount"),
  commentList: document.querySelector("#commentList"),
  commentForm: document.querySelector("#commentForm"),
  commentBody: document.querySelector("#commentBody"),
  commentMessage: document.querySelector("#commentMessage")
};

const SEEN_TASKS_KEY = "training-seen-task-ids";
const NEW_TASK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

let selectedEmployeeId = "";
let selectedTaskId = "";
let taskMode = "required";
let feedbackType = "like";
let saving = false;
let savingComment = false;
let savingFeedback = false;
let knownTaskIds = new Set();
let hasTrackedTasks = false;
let toastTimer = null;

function redirectToPortal() {
  window.location.href = "./index.html";
}

function renderEmployeePage() {
  const state = TrainingStore.getState();

  if (!TrainingStore.isEmployeeSession()) {
    redirectToPortal();
    return;
  }

  if (state.loading) {
    renderLoading();
    return;
  }

  if (state.error) {
    renderError(state.error);
    return;
  }

  const employee = TrainingStore.sessionEmployee();
  if (!employee) {
    renderError("当前用户名还没有完成员工身份绑定，请回到入口重新登录。");
    return;
  }
  selectedEmployeeId = employee.id;
  const visibleTasks = visibleTasksForMode(state, employee);
  if (!visibleTasks.some(task => task.id === selectedTaskId)) {
    selectedTaskId = visibleTasks[0]?.id ?? "";
  }

  trackNewTasks(state, employee);
  renderDatabaseNotice(state);
  renderEmployeeIdentity(employee);
  renderEmployeeSummary(state, employee);
  renderNotifications(state, employee);
  renderFeedbackTaskOptions(state);
  renderTaskModeControls();
  renderTaskList(state, employee);
  renderArticle(state.tasks.find(task => task.id === selectedTaskId), state);
}

function renderLoading() {
  employeeEls.currentUsername.textContent = "加载中";
  employeeEls.employeeDone.textContent = "0/0";
  employeeEls.employeePercent.textContent = "0%";
  TrainingStore.setProgress(employeeEls.employeeProgress, 0);
  employeeEls.notificationList.innerHTML = `<div class="empty-state">正在加载任务提醒...</div>`;
  employeeEls.taskList.innerHTML = `<div class="empty-state">正在加载培训数据...</div>`;
  employeeEls.articleTitle.textContent = "培训文章";
  employeeEls.articleStatus.textContent = "加载中";
  employeeEls.articleStatus.classList.remove("is-done");
  employeeEls.articleBody.innerHTML = `<p class="empty-state">正在连接 Supabase。</p>`;
  employeeEls.completeTaskBtn.disabled = true;
  renderComments(null, TrainingStore.getState());
  renderFeedbackTaskOptions(TrainingStore.getState());
}

function renderError(message) {
  employeeEls.notificationList.innerHTML = `<div class="empty-state">${TrainingStore.esc(message)}</div>`;
  employeeEls.taskList.innerHTML = `<div class="empty-state">${TrainingStore.esc(message)}</div>`;
  employeeEls.articleTitle.textContent = "无法加载";
  employeeEls.articleStatus.textContent = "错误";
  employeeEls.articleStatus.classList.remove("is-done");
  employeeEls.articleBody.innerHTML = `<p class="empty-state">${TrainingStore.esc(message)}</p>`;
  employeeEls.completeTaskBtn.disabled = true;
  renderComments(null, TrainingStore.getState());
  renderFeedbackTaskOptions(TrainingStore.getState());
}

function renderDatabaseNotice(state) {
  if (!employeeEls.databaseNotice) return;
  employeeEls.databaseNotice.hidden = !state.databaseNotice;
  employeeEls.databaseNotice.textContent = state.databaseNotice;
}

function renderEmployeeIdentity(employee) {
  employeeEls.currentUsername.textContent = `${employee.name} · ${employee.department}`;
}

function renderFeedbackTaskOptions(state) {
  if (!employeeEls.feedbackTask) return;
  const currentValue = employeeEls.feedbackTask.value || selectedTaskId;
  employeeEls.feedbackTask.innerHTML = `
    <option value="">不关联具体任务</option>
    ${state.tasks.map(task => `
      <option value="${TrainingStore.esc(task.id)}">${TrainingStore.esc(task.title)}</option>
    `).join("")}
  `;
  if ([...employeeEls.feedbackTask.options].some(option => option.value === currentValue)) {
    employeeEls.feedbackTask.value = currentValue;
  }
}

function visibleTasksForMode(state, employee) {
  return taskMode === "square"
    ? TrainingStore.learningSquareTasksForEmployee(employee)
    : TrainingStore.assignedTasksForEmployee(employee);
}

function renderEmployeeSummary(state, employee) {
  const done = TrainingStore.employeeAssignedCompletions(employee).length;
  const total = TrainingStore.assignedTasksForEmployee(employee).length;
  const pct = TrainingStore.percent(done, total);

  employeeEls.employeeDone.textContent = `${done}/${total}`;
  employeeEls.employeePercent.textContent = `${pct}%`;
  TrainingStore.setProgress(employeeEls.employeeProgress, pct);
}

function renderNotifications(state, employee) {
  const incompleteTasks = TrainingStore.assignedTasksForEmployee(employee)
    .filter(task => !TrainingStore.isComplete(selectedEmployeeId, task.id));
  const rows = incompleteTasks
    .map(task => {
      const deadline = TrainingStore.deadlineStatus(task, false);
      const isNew = isRecentlyCreated(task) && !getSeenTaskIds().has(task.id);
      const priority = deadline.level === "overdue" ? 0 : deadline.level === "soon" ? 1 : isNew ? 2 : 3;
      return { task, deadline, isNew, priority };
    })
    .sort((a, b) => a.priority - b.priority || new Date(a.task.dueAt || a.task.createdAt || 0) - new Date(b.task.dueAt || b.task.createdAt || 0));

  const permissionPrompt = browserNotificationsAvailable() && Notification.permission === "default"
    ? `
      <div class="notification-permission">
        <span>可开启浏览器通知，网页打开时会弹出新增任务提醒。</span>
        <button class="small-btn" type="button" data-enable-notifications>开启通知</button>
      </div>
    `
    : "";

  employeeEls.notificationList.innerHTML = rows.length
    ? `${permissionPrompt}${rows.map(({ task, deadline, isNew }) => {
      const label = deadline.level === "overdue"
        ? "已逾期"
        : deadline.level === "soon"
          ? "即将截止"
          : isNew
            ? "新增任务"
            : "待完成";
      return `
        <div class="notification-item is-${TrainingStore.esc(deadline.level)} ${isNew ? "is-new" : ""}">
          <div>
            <div class="notification-title">${TrainingStore.esc(label)}：${TrainingStore.esc(task.title)}</div>
            <div class="notification-meta">${TrainingStore.esc(deadline.label)}</div>
          </div>
          <button class="small-btn" type="button" data-open-task="${TrainingStore.esc(task.id)}">打开</button>
        </div>
      `;
    }).join("")}`
    : `${permissionPrompt}<div class="empty-state">当前没有待完成提醒。</div>`;
}

function renderTaskModeControls() {
  document.querySelectorAll("[data-task-mode]").forEach(button => {
    button.classList.toggle("is-active", button.dataset.taskMode === taskMode);
  });
  if (employeeEls.taskPanelTitle) {
    employeeEls.taskPanelTitle.textContent = taskMode === "square" ? "学习广场" : "必修任务";
  }
}

function renderTaskList(state, employee) {
  const visibleTasks = visibleTasksForMode(state, employee);
  employeeEls.taskList.innerHTML = visibleTasks.length
    ? visibleTasks.map(task => {
      const complete = TrainingStore.isComplete(selectedEmployeeId, task.id);
      const selected = task.id === selectedTaskId;
      const deadline = TrainingStore.deadlineStatus(task, complete);
      const commentCount = TrainingStore.taskComments(task.id).length;
      const required = TrainingStore.isTaskAssignedToDepartment(task, employee.department);
      const targetLabel = task.targetDepartments.length === TrainingStore.departments.length
        ? "全部部门"
        : task.targetDepartments.join("、");
      return `
        <div class="task-item ${selected ? "is-selected" : ""}" data-task-id="${TrainingStore.esc(task.id)}">
          <div>
            <div class="task-title">${TrainingStore.esc(task.title)}</div>
            <div class="task-meta">
              <span>${TrainingStore.esc(task.type)}</span>
              <span>${TrainingStore.esc(task.minutes)} 分钟</span>
              <span>${required ? "本部门必修" : "自主学习"}</span>
              <span>目标：${TrainingStore.esc(targetLabel)}</span>
              <span>${complete ? "已完成" : "未完成"}</span>
              <span class="deadline-text is-${TrainingStore.esc(deadline.level)}">${TrainingStore.esc(deadline.detail)}</span>
              <span>${commentCount} 条评论</span>
            </div>
          </div>
          <button class="small-btn" type="button" data-open-task="${TrainingStore.esc(task.id)}">打开</button>
        </div>
      `;
    }).join("")
    : `<div class="empty-state">${taskMode === "square" ? "学习广场暂无其他部门任务。" : "当前部门暂无必修任务。"}</div>`;
}

function renderArticle(task, state) {
  if (!task) {
    employeeEls.articleTitle.textContent = "培训文章";
    employeeEls.articleBody.innerHTML = `<p class="empty-state">暂无内容</p>`;
    employeeEls.articleStatus.textContent = "未选择";
    employeeEls.articleStatus.classList.remove("is-done");
    employeeEls.completeTaskBtn.disabled = true;
    renderComments(null, state);
    return;
  }

  const complete = TrainingStore.isComplete(selectedEmployeeId, task.id);
  const employee = TrainingStore.sessionEmployee();
  const required = TrainingStore.isTaskAssignedToDepartment(task, employee?.department);
  const deadline = TrainingStore.deadlineStatus(task, complete);
  const paragraphs = task.content.map(paragraph => `<p>${TrainingStore.esc(paragraph)}</p>`).join("");
  const scopeLabel = required ? "本部门必修任务" : "学习广场自主学习任务";
  employeeEls.articleTitle.textContent = task.title;
  employeeEls.articleBody.innerHTML = `
    <div class="article-deadline is-${TrainingStore.esc(deadline.level)}">
      <strong>${TrainingStore.esc(deadline.label)}</strong>
      <span>${TrainingStore.esc(`${scopeLabel}。${complete ? "该任务已完成。" : required ? "请在截止时间前完成任务。" : "完成后会记录为自主学习，不影响必修进度。"}`)}</span>
    </div>
    ${paragraphs || `<p class="empty-state">暂无内容</p>`}
  `;
  employeeEls.articleStatus.textContent = complete ? "已完成" : "未完成";
  employeeEls.articleStatus.classList.toggle("is-done", complete);
  employeeEls.completeTaskBtn.disabled = complete || saving;
  employeeEls.completeTaskBtn.lastChild.textContent = saving ? " 保存中" : " 标记完成";
  renderComments(task, state);
}

function renderComments(task, state) {
  if (!employeeEls.commentList) return;

  if (!task) {
    employeeEls.commentCount.textContent = "0 条";
    employeeEls.commentList.innerHTML = `<div class="empty-state">选择任务后查看评论。</div>`;
    employeeEls.commentBody.disabled = true;
    employeeEls.commentForm.querySelector("button[type='submit']").disabled = true;
    return;
  }

  if (state.schema.comments === false) {
    employeeEls.commentCount.textContent = "未启用";
    employeeEls.commentList.innerHTML = `<div class="empty-state">评论区需要先执行 Supabase 升级 SQL。</div>`;
    employeeEls.commentBody.disabled = true;
    employeeEls.commentForm.querySelector("button[type='submit']").disabled = true;
    return;
  }

  const comments = TrainingStore.taskComments(task.id);
  employeeEls.commentCount.textContent = `${comments.length} 条`;
  employeeEls.commentBody.disabled = savingComment;
  employeeEls.commentForm.querySelector("button[type='submit']").disabled = savingComment;
  employeeEls.commentList.innerHTML = comments.length
    ? comments.map(comment => {
      const employee = state.employees.find(item => item.id === comment.employeeId);
      return `
        <div class="comment-item">
          <div class="comment-head">
            <strong>${TrainingStore.esc(employee?.name ?? "未知员工")}</strong>
            <span>${TrainingStore.esc(TrainingStore.formatTime(comment.createdAt))}</span>
          </div>
          <div class="comment-body">${TrainingStore.esc(comment.body)}</div>
        </div>
      `;
    }).join("")
    : `<div class="empty-state">暂无评论，可以发起讨论。</div>`;
}

function getSeenTaskIds() {
  try {
    const raw = window.localStorage.getItem(SEEN_TASKS_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

function saveSeenTaskIds(ids) {
  try {
    window.localStorage.setItem(SEEN_TASKS_KEY, JSON.stringify([...ids]));
  } catch {
    // localStorage 可能被浏览器禁用，忽略即可。
  }
}

function markTaskSeen(taskId) {
  if (!taskId) return;
  const ids = getSeenTaskIds();
  ids.add(taskId);
  saveSeenTaskIds(ids);
}

function isRecentlyCreated(task) {
  const createdAt = new Date(task.createdAt).getTime();
  if (Number.isNaN(createdAt)) return false;
  return Date.now() - createdAt <= NEW_TASK_WINDOW_MS;
}

function trackNewTasks(state, employee) {
  const assignedTasks = TrainingStore.assignedTasksForEmployee(employee);
  const currentIds = new Set(assignedTasks.map(task => task.id));
  if (hasTrackedTasks) {
    const newTasks = assignedTasks.filter(task => !knownTaskIds.has(task.id));
    if (newTasks.length) {
      showTaskToast(newTasks[0], newTasks.length);
      showBrowserNotification(newTasks[0], newTasks.length);
    }
  }
  knownTaskIds = currentIds;
  hasTrackedTasks = true;
}

function showTaskToast(task, count) {
  let toast = document.querySelector(".task-toast");
  if (!toast) {
    toast = document.createElement("button");
    toast.className = "task-toast";
    toast.type = "button";
    document.body.appendChild(toast);
  }
  toast.dataset.openTask = task.id;
  toast.textContent = count > 1
    ? `新增 ${count} 个培训任务`
    : `新增任务：${task.title}`;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 6000);
}

function browserNotificationsAvailable() {
  return "Notification" in window && window.isSecureContext;
}

function showBrowserNotification(task, count) {
  if (!browserNotificationsAvailable() || Notification.permission !== "granted") return;
  const title = count > 1 ? `新增 ${count} 个培训任务` : "新增培训任务";
  new Notification(title, {
    body: task.title,
    tag: `training-task-${task.id}`
  });
}

function openFeedbackDrawer() {
  employeeEls.feedbackDrawer.hidden = false;
  employeeEls.feedbackMessage.textContent = "";
  employeeEls.feedbackMessage.classList.remove("is-error", "is-success");
  if (selectedTaskId) employeeEls.feedbackTask.value = selectedTaskId;
  employeeEls.feedbackBody.focus();
}

function closeFeedbackDrawer() {
  employeeEls.feedbackDrawer.hidden = true;
}

function renderFeedbackType() {
  document.querySelectorAll("[data-feedback-type]").forEach(button => {
    button.classList.toggle("is-active", button.dataset.feedbackType === feedbackType);
  });
}

employeeEls.logoutBtn.addEventListener("click", () => {
  TrainingStore.clearSession();
  redirectToPortal();
});

employeeEls.feedbackOpenBtn.addEventListener("click", openFeedbackDrawer);

document.querySelectorAll("[data-feedback-close]").forEach(trigger => {
  trigger.addEventListener("click", closeFeedbackDrawer);
});

employeeEls.feedbackOptions.addEventListener("click", event => {
  const trigger = event.target.closest("[data-feedback-type]");
  if (!trigger) return;
  feedbackType = trigger.dataset.feedbackType;
  renderFeedbackType();
  employeeEls.feedbackBody.focus();
});

employeeEls.taskList.addEventListener("click", event => {
  const trigger = event.target.closest("[data-open-task], .task-item");
  if (!trigger) return;
  selectedTaskId = trigger.dataset.openTask ?? trigger.dataset.taskId;
  markTaskSeen(selectedTaskId);
  renderEmployeePage();
});

document.querySelectorAll("[data-task-mode]").forEach(button => {
  button.addEventListener("click", () => {
    taskMode = button.dataset.taskMode;
    const employee = TrainingStore.sessionEmployee();
    const visibleTasks = visibleTasksForMode(TrainingStore.getState(), employee);
    selectedTaskId = visibleTasks[0]?.id ?? "";
    renderEmployeePage();
  });
});

employeeEls.notificationList.addEventListener("click", async event => {
  const permissionButton = event.target.closest("[data-enable-notifications]");
  if (permissionButton && browserNotificationsAvailable()) {
    await Notification.requestPermission();
    renderEmployeePage();
    return;
  }

  const trigger = event.target.closest("[data-open-task]");
  if (!trigger) return;
  taskMode = "required";
  selectedTaskId = trigger.dataset.openTask;
  markTaskSeen(selectedTaskId);
  renderEmployeePage();
});

document.body.addEventListener("click", event => {
  const trigger = event.target.closest(".task-toast[data-open-task]");
  if (!trigger) return;
  taskMode = "required";
  selectedTaskId = trigger.dataset.openTask;
  markTaskSeen(selectedTaskId);
  trigger.classList.remove("is-visible");
  renderEmployeePage();
});

employeeEls.completeTaskBtn.addEventListener("click", async () => {
  if (saving) return;
  saving = true;
  markTaskSeen(selectedTaskId);
  renderEmployeePage();
  await TrainingStore.completeTask(selectedEmployeeId, selectedTaskId);
  saving = false;
  renderEmployeePage();
});

employeeEls.commentForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (savingComment) return;

  savingComment = true;
  employeeEls.commentMessage.textContent = "";
  employeeEls.commentMessage.classList.remove("is-error", "is-success");
  renderEmployeePage();

  try {
    const comment = await TrainingStore.createComment({
      taskId: selectedTaskId,
      employeeId: selectedEmployeeId,
      body: employeeEls.commentBody.value
    });
    if (comment) {
      employeeEls.commentBody.value = "";
      employeeEls.commentMessage.textContent = "评论已发送。";
      employeeEls.commentMessage.classList.add("is-success");
    }
  } catch (error) {
    console.error(error);
    employeeEls.commentMessage.textContent = error.message || "评论发送失败，请稍后重试。";
    employeeEls.commentMessage.classList.add("is-error");
  } finally {
    savingComment = false;
    renderEmployeePage();
  }
});

employeeEls.feedbackForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (savingFeedback) return;

  const employee = TrainingStore.sessionEmployee();
  savingFeedback = true;
  employeeEls.feedbackMessage.textContent = "";
  employeeEls.feedbackMessage.classList.remove("is-error", "is-success");
  employeeEls.feedbackForm.querySelector("button[type='submit']").disabled = true;

  try {
    const feedback = await TrainingStore.createFeedback({
      employeeId: employee?.id,
      taskId: employeeEls.feedbackTask.value,
      type: feedbackType,
      body: employeeEls.feedbackBody.value
    });
    if (feedback) {
      employeeEls.feedbackBody.value = "";
      employeeEls.feedbackMessage.textContent = "反馈已提交。";
      employeeEls.feedbackMessage.classList.add("is-success");
      window.setTimeout(closeFeedbackDrawer, 700);
    }
  } catch (error) {
    console.error(error);
    employeeEls.feedbackMessage.textContent = error.message || "反馈提交失败，请稍后重试。";
    employeeEls.feedbackMessage.classList.add("is-error");
  } finally {
    savingFeedback = false;
    employeeEls.feedbackForm.querySelector("button[type='submit']").disabled = false;
  }
});

TrainingStore.subscribe(renderEmployeePage);
renderFeedbackType();
renderEmployeePage();

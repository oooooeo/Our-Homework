const adminEls = {
  currentUsername: document.querySelector("#currentUsername"),
  logoutBtn: document.querySelector("#logoutBtn"),
  employeeCount: document.querySelector("#employeeCount"),
  taskCount: document.querySelector("#taskCount"),
  completionCount: document.querySelector("#completionCount"),
  overallProgress: document.querySelector("#overallProgress"),
  feedbackCount: document.querySelector("#feedbackCount"),
  questionCount: document.querySelector("#questionCount"),
  feedbackInboxCount: document.querySelector("#feedbackInboxCount"),
  questionInboxCount: document.querySelector("#questionInboxCount"),
  feedbackRows: document.querySelector("#feedbackRows"),
  questionRows: document.querySelector("#questionRows"),
  employeeRows: document.querySelector("#employeeRows"),
  taskRows: document.querySelector("#taskRows"),
  taskForm: document.querySelector("#taskForm"),
  newTaskTitle: document.querySelector("#newTaskTitle"),
  newTaskDueAt: document.querySelector("#newTaskDueAt"),
  newTaskDepartments: document.querySelector("#newTaskDepartments"),
  newTaskContent: document.querySelector("#newTaskContent"),
  taskFormMessage: document.querySelector("#taskFormMessage"),
  databaseNotice: document.querySelector("#databaseNotice"),
  questionFormMessage: document.querySelector("#questionFormMessage"),
  recentList: document.querySelector("#recentList")
};

let savingTask = false;
let deletingTaskId = "";
let deletingEmployeeId = "";
let answeringQuestionId = "";

function renderDepartmentOptions() {
  if (!adminEls.newTaskDepartments) return;
  adminEls.newTaskDepartments.innerHTML = TrainingStore.departments.map(department => `
    <label class="check-option">
      <input type="checkbox" value="${TrainingStore.esc(department)}" checked>
      <span>${TrainingStore.esc(department)}</span>
    </label>
  `).join("");
}

function redirectToPortal() {
  window.location.href = "./index.html";
}

function renderAdminPage() {
  if (!TrainingStore.isManagerSession()) {
    redirectToPortal();
    return;
  }

  const state = TrainingStore.getState();
  adminEls.currentUsername.textContent = TrainingStore.getSession()?.username ?? "supermanager";

  if (state.loading) {
    renderLoading();
    return;
  }

  if (state.error) {
    renderError(state.error);
    return;
  }

  const totalCapacity = TrainingStore.requiredCapacity();
  const completionCount = TrainingStore.requiredCompletionCount();
  const overallPct = TrainingStore.percent(completionCount, totalCapacity);

  adminEls.employeeCount.textContent = String(state.employees.length);
  adminEls.taskCount.textContent = String(state.tasks.length);
  adminEls.completionCount.textContent = String(completionCount);
  adminEls.feedbackCount.textContent = String(state.feedback.length);
  adminEls.questionCount.textContent = String(state.questions.length);
  adminEls.feedbackInboxCount.textContent = `${state.feedback.length} 条反馈`;
  adminEls.questionInboxCount.textContent = `${state.questions.length} 个问题`;
  TrainingStore.setProgress(adminEls.overallProgress, overallPct);

  renderDatabaseNotice(state);
  renderEmployeeRows(state);
  renderTaskRows(state);
  renderRecentList(state);
  renderFeedbackRows(state);
  renderQuestionRows(state);
}

function renderLoading() {
  adminEls.employeeCount.textContent = "0";
  adminEls.taskCount.textContent = "0";
  adminEls.completionCount.textContent = "0";
  adminEls.feedbackCount.textContent = "0";
  adminEls.questionCount.textContent = "0";
  adminEls.feedbackInboxCount.textContent = "0 条反馈";
  adminEls.questionInboxCount.textContent = "0 个问题";
  TrainingStore.setProgress(adminEls.overallProgress, 0);
  adminEls.employeeRows.innerHTML = `<tr><td colspan="6" class="empty-table">正在加载培训数据...</td></tr>`;
  adminEls.taskRows.innerHTML = `<tr><td colspan="6" class="empty-table">正在加载培训任务...</td></tr>`;
  adminEls.recentList.innerHTML = `<div class="empty-state">正在连接 Supabase。</div>`;
  adminEls.feedbackRows.innerHTML = `<div class="empty-state">正在加载员工反馈...</div>`;
  adminEls.questionRows.innerHTML = `<div class="empty-state">正在加载公开问题...</div>`;
}

function renderError(message) {
  adminEls.employeeRows.innerHTML = `<tr><td colspan="6" class="empty-table">${TrainingStore.esc(message)}</td></tr>`;
  adminEls.taskRows.innerHTML = `<tr><td colspan="6" class="empty-table">${TrainingStore.esc(message)}</td></tr>`;
  adminEls.recentList.innerHTML = `<div class="empty-state">${TrainingStore.esc(message)}</div>`;
  adminEls.feedbackRows.innerHTML = `<div class="empty-state">${TrainingStore.esc(message)}</div>`;
  adminEls.questionRows.innerHTML = `<div class="empty-state">${TrainingStore.esc(message)}</div>`;
}

function renderDatabaseNotice(state) {
  if (!adminEls.databaseNotice) return;
  adminEls.databaseNotice.hidden = !state.databaseNotice;
  adminEls.databaseNotice.textContent = state.databaseNotice;
}

function renderEmployeeRows(state) {
  adminEls.employeeRows.innerHTML = state.employees.map(employee => {
    const assignedTasks = TrainingStore.assignedTasksForEmployee(employee);
    const records = TrainingStore.employeeAssignedCompletions(employee);
    const pct = TrainingStore.percent(records.length, assignedTasks.length);
    const last = records.slice().sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))[0];

    return `
      <tr>
        <td><strong>${TrainingStore.esc(employee.name)}</strong></td>
        <td>${TrainingStore.esc(employee.department)}</td>
        <td>${records.length}/${assignedTasks.length}</td>
        <td>
          <div class="row-progress">
            <div class="progress-track"><div class="progress-fill" data-pct="${pct}"></div></div>
            <span>${pct}%</span>
          </div>
        </td>
        <td>${TrainingStore.esc(TrainingStore.formatTime(last?.completedAt))}</td>
        <td>
          <button class="danger-btn compact-btn" type="button" data-delete-employee="${TrainingStore.esc(employee.id)}" ${deletingEmployeeId === employee.id ? "disabled" : ""}>
            ${deletingEmployeeId === employee.id ? "注销中" : "注销"}
          </button>
        </td>
      </tr>
    `;
  }).join("");

  syncRowProgress();
}

function renderTaskRows(state) {
  const rows = state.tasks
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  adminEls.taskRows.innerHTML = rows.map(task => {
    const assignedEmployees = TrainingStore.assignedEmployeesForTask(task);
    const records = TrainingStore.taskAssignedCompletions(task);
    const pct = TrainingStore.percent(records.length, assignedEmployees.length);
    const complete = pct >= 100;
    const deadline = TrainingStore.deadlineStatus(task, complete);
    const targetLabel = task.targetDepartments.length === TrainingStore.departments.length
      ? "全部部门"
      : task.targetDepartments.join("、");

    return `
      <tr>
        <td><strong>${TrainingStore.esc(task.title)}</strong></td>
        <td>${TrainingStore.esc(task.type)}</td>
        <td>${TrainingStore.esc(targetLabel)}</td>
        <td>
          <span class="deadline-pill is-${TrainingStore.esc(deadline.level)}">${TrainingStore.esc(deadline.detail)}</span>
        </td>
        <td>
          <div class="row-progress">
            <div class="progress-track"><div class="progress-fill" data-pct="${pct}"></div></div>
            <span>${pct}%</span>
          </div>
        </td>
        <td>
          <button class="danger-btn" type="button" data-delete-task="${TrainingStore.esc(task.id)}" ${deletingTaskId === task.id ? "disabled" : ""}>
            ${deletingTaskId === task.id ? "删除中" : "撤回"}
          </button>
        </td>
      </tr>
    `;
  }).join("");

  syncRowProgress();
}

function syncRowProgress() {
  document.querySelectorAll(".row-progress .progress-fill").forEach(fill => {
    TrainingStore.setProgress(fill, Number(fill.dataset.pct));
  });
}

function renderRecentList(state) {
  const taskById = new Map(state.tasks.map(task => [task.id, task]));
  const employeeById = new Map(state.employees.map(employee => [employee.id, employee]));
  const rows = state.completions
    .filter(record => {
      const task = taskById.get(record.taskId);
      const employee = employeeById.get(record.employeeId);
      return task && employee && TrainingStore.isTaskAssignedToDepartment(task, employee.department);
    })
    .slice()
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
    .slice(0, 8);

  adminEls.recentList.innerHTML = rows.length
    ? rows.map(record => {
      const employee = state.employees.find(item => item.id === record.employeeId);
      const task = state.tasks.find(item => item.id === record.taskId);
      return `
        <div class="recent-item">
          <div class="recent-main">${TrainingStore.esc(employee?.name ?? "未知员工")} 完成 ${TrainingStore.esc(task?.title ?? "未知任务")}</div>
          <div class="recent-meta">${TrainingStore.esc(TrainingStore.formatTime(record.completedAt))}</div>
        </div>
      `;
    }).join("")
    : `<div class="empty-state">暂无完成记录</div>`;
}

function feedbackTypeLabel(type) {
  return {
    like: "满意",
    dislike: "不满意",
    suggestion: "建议"
  }[type] ?? "反馈";
}

function questionStatusLabel(status) {
  return {
    open: "待回复",
    answered: "已回复",
    resolved: "已解决"
  }[status] ?? "待回复";
}

function renderFeedbackRows(state) {
  if (state.schema.feedback === false) {
    adminEls.feedbackRows.innerHTML = `<div class="empty-state">意见箱需要先执行 Supabase 升级 SQL。</div>`;
    return;
  }

  adminEls.feedbackRows.innerHTML = state.feedback.length
    ? state.feedback.map(item => {
      const employee = state.employees.find(row => row.id === item.employeeId);
      const task = state.tasks.find(row => row.id === item.taskId);
      return `
        <article class="feedback-inbox-item">
          <div class="feedback-inbox-meta">
            <span class="feedback-type is-${TrainingStore.esc(item.type)}">${TrainingStore.esc(feedbackTypeLabel(item.type))}</span>
            <strong>${TrainingStore.esc(employee?.name ?? "未知员工")}</strong>
            <span>${TrainingStore.esc(employee?.department ?? "未知部门")}</span>
            <span>${TrainingStore.esc(TrainingStore.formatTime(item.createdAt))}</span>
          </div>
          <div class="feedback-inbox-task">${TrainingStore.esc(task ? `关联任务：${task.title}` : "未关联具体任务")}</div>
          <div class="feedback-inbox-body">${TrainingStore.esc(item.body)}</div>
        </article>
      `;
    }).join("")
    : `<div class="empty-state">暂无员工反馈</div>`;
}

function renderQuestionRows(state) {
  if (document.activeElement?.matches?.(".question-answer-form textarea")) {
    return;
  }

  if (state.schema.questions === false) {
    adminEls.questionRows.innerHTML = `<div class="empty-state">公开问题库需要先执行 Supabase 升级 SQL。</div>`;
    return;
  }

  const employees = new Map(state.employees.map(employee => [employee.id, employee]));
  const tasks = new Map(state.tasks.map(task => [task.id, task]));
  const statusOrder = { open: 0, answered: 1, resolved: 2 };
  const rows = state.questions
    .slice()
    .sort((a, b) => {
      const statusDiff = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
      if (statusDiff) return statusDiff;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  adminEls.questionRows.innerHTML = rows.length
    ? rows.map(item => {
      const employee = employees.get(item.employeeId);
      const task = tasks.get(item.taskId);
      const isSaving = answeringQuestionId === item.id;
      return `
        <article class="question-admin-item">
          <div class="public-question-head">
            <span class="question-status is-${TrainingStore.esc(item.status)}">${TrainingStore.esc(questionStatusLabel(item.status))}</span>
            <strong>${TrainingStore.esc(item.title)}</strong>
          </div>
          <div class="public-question-meta">
            <span>${TrainingStore.esc(item.topic)}</span>
            <span>${TrainingStore.esc(employee?.name ?? "未知员工")} · ${TrainingStore.esc(employee?.department ?? "未知部门")}</span>
            <span>${TrainingStore.esc(TrainingStore.formatTime(item.createdAt))}</span>
            <span>${TrainingStore.esc(task ? `关联：${task.title}` : "未关联任务")}</span>
          </div>
          <div class="public-question-body">${TrainingStore.esc(item.body)}</div>
          ${item.answerBody ? `
            <div class="public-question-answer question-admin-answer">
              <strong>当前回复</strong>
              <p>${TrainingStore.esc(item.answerBody)}</p>
              <small>${TrainingStore.esc(item.answeredBy ?? "supermanager")} · ${TrainingStore.esc(TrainingStore.formatTime(item.answeredAt))}</small>
            </div>
          ` : ""}
          <form class="question-answer-form" data-question-form="${TrainingStore.esc(item.id)}">
            <textarea name="answer" rows="3" placeholder="输入给员工公开可见的回复..." required>${TrainingStore.esc(item.answerBody ?? "")}</textarea>
            <div class="question-answer-actions">
              <button class="small-btn" type="submit" data-question-status="answered" ${isSaving ? "disabled" : ""}>
                ${isSaving ? "保存中" : "回复"}
              </button>
              <button class="primary-btn" type="submit" data-question-status="resolved" ${isSaving ? "disabled" : ""}>
                ${isSaving ? "保存中" : "回复并解决"}
              </button>
            </div>
          </form>
        </article>
      `;
    }).join("")
    : `<div class="empty-state">暂无公开问题</div>`;
}

function selectedDepartments() {
  const checked = [...adminEls.newTaskDepartments.querySelectorAll("input[type='checkbox']:checked")];
  return checked.map(input => input.value);
}

adminEls.taskForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (savingTask) return;

  savingTask = true;
  adminEls.taskFormMessage.textContent = "";
  adminEls.taskFormMessage.classList.remove("is-error", "is-success");
  const submitButton = adminEls.taskForm.querySelector("button[type='submit']");
  submitButton.disabled = true;
  submitButton.lastChild.textContent = " 保存中";

  try {
    const targetDepartments = selectedDepartments();
    if (!targetDepartments.length) {
      throw new Error("请至少选择一个目标部门。");
    }
    const task = await TrainingStore.createTask({
      title: adminEls.newTaskTitle.value,
      dueAt: adminEls.newTaskDueAt.value,
      content: adminEls.newTaskContent.value,
      targetDepartments
    });
    if (task) {
      adminEls.taskForm.reset();
      adminEls.taskFormMessage.textContent = "任务已新增，员工端会在刷新后收到提醒。";
      adminEls.taskFormMessage.classList.add("is-success");
    }
  } catch (error) {
    console.error(error);
    adminEls.taskFormMessage.textContent = error.message || "新增任务失败，请稍后重试。";
    adminEls.taskFormMessage.classList.add("is-error");
  } finally {
    savingTask = false;
    submitButton.disabled = false;
    submitButton.lastChild.textContent = " 新增任务";
  }
});

adminEls.taskRows.addEventListener("click", async event => {
  const trigger = event.target.closest("[data-delete-task]");
  if (!trigger || deletingTaskId) return;

  const taskId = trigger.dataset.deleteTask;
  const state = TrainingStore.getState();
  const task = state.tasks.find(item => item.id === taskId);
  const message = `确认撤回任务“${task?.title ?? "未知任务"}”吗？相关完成记录和评论也会被删除。`;
  if (!window.confirm(message)) return;

  deletingTaskId = taskId;
  renderAdminPage();

  try {
    await TrainingStore.deleteTask(taskId);
  } catch (error) {
    console.error(error);
    adminEls.taskFormMessage.textContent = error.message || "删除任务失败，请稍后重试。";
    adminEls.taskFormMessage.classList.add("is-error");
  } finally {
    deletingTaskId = "";
    renderAdminPage();
  }
});

adminEls.employeeRows.addEventListener("click", async event => {
  const trigger = event.target.closest("[data-delete-employee]");
  if (!trigger || deletingEmployeeId) return;

  const employeeId = trigger.dataset.deleteEmployee;
  const state = TrainingStore.getState();
  const employee = state.employees.find(item => item.id === employeeId);
  const message = `确认注销员工“${employee?.name ?? "未知员工"}”吗？该员工账号、完成记录和评论都会被删除。`;
  if (!window.confirm(message)) return;

  deletingEmployeeId = employeeId;
  renderAdminPage();

  try {
    await TrainingStore.deleteEmployee(employeeId);
  } catch (error) {
    console.error(error);
    adminEls.taskFormMessage.textContent = error.message || "注销员工失败，请稍后重试。";
    adminEls.taskFormMessage.classList.add("is-error");
  } finally {
    deletingEmployeeId = "";
    renderAdminPage();
  }
});

adminEls.questionRows.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.target.closest("[data-question-form]");
  if (!form || answeringQuestionId) return;

  const questionId = form.dataset.questionForm;
  const answer = new FormData(form).get("answer");
  const status = event.submitter?.dataset.questionStatus ?? "answered";
  answeringQuestionId = questionId;
  adminEls.questionFormMessage.textContent = "";
  adminEls.questionFormMessage.classList.remove("is-error", "is-success");
  renderAdminPage();

  try {
    await TrainingStore.answerQuestion({ questionId, answer, status });
    adminEls.questionFormMessage.textContent = status === "resolved" ? "问题已回复并标记为已解决。" : "问题已回复。";
    adminEls.questionFormMessage.classList.add("is-success");
  } catch (error) {
    console.error(error);
    adminEls.questionFormMessage.textContent = error.message || "回复问题失败，请稍后重试。";
    adminEls.questionFormMessage.classList.add("is-error");
  } finally {
    answeringQuestionId = "";
    renderAdminPage();
  }
});

adminEls.logoutBtn.addEventListener("click", () => {
  TrainingStore.clearSession();
  redirectToPortal();
});

TrainingStore.subscribe(renderAdminPage);
renderDepartmentOptions();
renderAdminPage();

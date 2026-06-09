const adminEls = {
  currentUsername: document.querySelector("#currentUsername"),
  logoutBtn: document.querySelector("#logoutBtn"),
  employeeCount: document.querySelector("#employeeCount"),
  taskCount: document.querySelector("#taskCount"),
  completionCount: document.querySelector("#completionCount"),
  overallProgress: document.querySelector("#overallProgress"),
  employeeRows: document.querySelector("#employeeRows"),
  taskRows: document.querySelector("#taskRows"),
  taskForm: document.querySelector("#taskForm"),
  newTaskTitle: document.querySelector("#newTaskTitle"),
  newTaskDueAt: document.querySelector("#newTaskDueAt"),
  newTaskContent: document.querySelector("#newTaskContent"),
  taskFormMessage: document.querySelector("#taskFormMessage"),
  databaseNotice: document.querySelector("#databaseNotice"),
  recentList: document.querySelector("#recentList")
};

let savingTask = false;

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

  const totalCapacity = state.employees.length * state.tasks.length;
  const completionCount = state.completions.length;
  const overallPct = TrainingStore.percent(completionCount, totalCapacity);

  adminEls.employeeCount.textContent = String(state.employees.length);
  adminEls.taskCount.textContent = String(state.tasks.length);
  adminEls.completionCount.textContent = String(completionCount);
  TrainingStore.setProgress(adminEls.overallProgress, overallPct);

  renderDatabaseNotice(state);
  renderEmployeeRows(state);
  renderTaskRows(state);
  renderRecentList(state);
}

function renderLoading() {
  adminEls.employeeCount.textContent = "0";
  adminEls.taskCount.textContent = "0";
  adminEls.completionCount.textContent = "0";
  TrainingStore.setProgress(adminEls.overallProgress, 0);
  adminEls.employeeRows.innerHTML = `<tr><td colspan="5" class="empty-table">正在加载培训数据...</td></tr>`;
  adminEls.taskRows.innerHTML = `<tr><td colspan="4" class="empty-table">正在加载培训任务...</td></tr>`;
  adminEls.recentList.innerHTML = `<div class="empty-state">正在连接 Supabase。</div>`;
}

function renderError(message) {
  adminEls.employeeRows.innerHTML = `<tr><td colspan="5" class="empty-table">${TrainingStore.esc(message)}</td></tr>`;
  adminEls.taskRows.innerHTML = `<tr><td colspan="4" class="empty-table">${TrainingStore.esc(message)}</td></tr>`;
  adminEls.recentList.innerHTML = `<div class="empty-state">${TrainingStore.esc(message)}</div>`;
}

function renderDatabaseNotice(state) {
  if (!adminEls.databaseNotice) return;
  adminEls.databaseNotice.hidden = !state.databaseNotice;
  adminEls.databaseNotice.textContent = state.databaseNotice;
}

function renderEmployeeRows(state) {
  adminEls.employeeRows.innerHTML = state.employees.map(employee => {
    const records = TrainingStore.employeeCompletions(employee.id);
    const pct = TrainingStore.percent(records.length, state.tasks.length);
    const last = records.slice().sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))[0];

    return `
      <tr>
        <td><strong>${TrainingStore.esc(employee.name)}</strong></td>
        <td>${TrainingStore.esc(employee.department)}</td>
        <td>${records.length}/${state.tasks.length}</td>
        <td>
          <div class="row-progress">
            <div class="progress-track"><div class="progress-fill" data-pct="${pct}"></div></div>
            <span>${pct}%</span>
          </div>
        </td>
        <td>${TrainingStore.esc(TrainingStore.formatTime(last?.completedAt))}</td>
      </tr>
    `;
  }).join("");

  syncRowProgress();
}

function renderTaskRows(state) {
  adminEls.taskRows.innerHTML = state.tasks.map(task => {
    const records = TrainingStore.taskCompletions(task.id);
    const pct = TrainingStore.percent(records.length, state.employees.length);
    const complete = pct >= 100;
    const deadline = TrainingStore.deadlineStatus(task, complete);

    return `
      <tr>
        <td><strong>${TrainingStore.esc(task.title)}</strong></td>
        <td>${TrainingStore.esc(task.type)}</td>
        <td>
          <span class="deadline-pill is-${TrainingStore.esc(deadline.level)}">${TrainingStore.esc(deadline.detail)}</span>
        </td>
        <td>
          <div class="row-progress">
            <div class="progress-track"><div class="progress-fill" data-pct="${pct}"></div></div>
            <span>${pct}%</span>
          </div>
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
  const rows = state.completions
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
    const task = await TrainingStore.createTask({
      title: adminEls.newTaskTitle.value,
      dueAt: adminEls.newTaskDueAt.value,
      content: adminEls.newTaskContent.value
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

adminEls.logoutBtn.addEventListener("click", () => {
  TrainingStore.clearSession();
  redirectToPortal();
});

TrainingStore.subscribe(renderAdminPage);
renderAdminPage();

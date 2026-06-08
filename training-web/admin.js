const adminEls = {
  employeeCount: document.querySelector("#employeeCount"),
  taskCount: document.querySelector("#taskCount"),
  completionCount: document.querySelector("#completionCount"),
  overallProgress: document.querySelector("#overallProgress"),
  employeeRows: document.querySelector("#employeeRows"),
  taskRows: document.querySelector("#taskRows"),
  taskForm: document.querySelector("#taskForm"),
  newTaskTitle: document.querySelector("#newTaskTitle"),
  newTaskContent: document.querySelector("#newTaskContent"),
  recentList: document.querySelector("#recentList")
};

function renderAdminPage() {
  const state = TrainingStore.getState();
  const totalCapacity = state.employees.length * state.tasks.length;
  const completionCount = state.completions.length;
  const overallPct = TrainingStore.percent(completionCount, totalCapacity);

  adminEls.employeeCount.textContent = String(state.employees.length);
  adminEls.taskCount.textContent = String(state.tasks.length);
  adminEls.completionCount.textContent = String(completionCount);
  TrainingStore.setProgress(adminEls.overallProgress, overallPct);

  renderEmployeeRows(state);
  renderTaskRows(state);
  renderRecentList(state);
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

    return `
      <tr>
        <td><strong>${TrainingStore.esc(task.title)}</strong></td>
        <td>${TrainingStore.esc(task.type)}</td>
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

adminEls.taskForm.addEventListener("submit", event => {
  event.preventDefault();
  const task = TrainingStore.createTask({
    title: adminEls.newTaskTitle.value,
    content: adminEls.newTaskContent.value
  });
  if (!task) return;
  adminEls.taskForm.reset();
});

TrainingStore.subscribe(renderAdminPage);
renderAdminPage();

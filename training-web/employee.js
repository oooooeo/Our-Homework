const employeeEls = {
  employeeSelect: document.querySelector("#employeeSelect"),
  employeeDone: document.querySelector("#employeeDone"),
  employeePercent: document.querySelector("#employeePercent"),
  employeeProgress: document.querySelector("#employeeProgress"),
  taskList: document.querySelector("#taskList"),
  articleTitle: document.querySelector("#articleTitle"),
  articleStatus: document.querySelector("#articleStatus"),
  articleBody: document.querySelector("#articleBody"),
  completeTaskBtn: document.querySelector("#completeTaskBtn")
};

let selectedEmployeeId = "";
let selectedTaskId = "";
let saving = false;

function renderEmployeePage() {
  const state = TrainingStore.getState();

  if (state.loading) {
    renderLoading();
    return;
  }

  if (state.error) {
    renderError(state.error);
    return;
  }

  if (!state.employees.some(employee => employee.id === selectedEmployeeId)) {
    selectedEmployeeId = state.employees[0]?.id ?? "";
  }
  if (!state.tasks.some(task => task.id === selectedTaskId)) {
    selectedTaskId = state.tasks[0]?.id ?? "";
  }

  renderEmployeeOptions(state);
  renderEmployeeSummary(state);
  renderTaskList(state);
  renderArticle(state.tasks.find(task => task.id === selectedTaskId));
}

function renderLoading() {
  employeeEls.employeeSelect.innerHTML = "";
  employeeEls.employeeDone.textContent = "0/0";
  employeeEls.employeePercent.textContent = "0%";
  TrainingStore.setProgress(employeeEls.employeeProgress, 0);
  employeeEls.taskList.innerHTML = `<div class="empty-state">正在加载培训数据...</div>`;
  employeeEls.articleTitle.textContent = "培训文章";
  employeeEls.articleStatus.textContent = "加载中";
  employeeEls.articleStatus.classList.remove("is-done");
  employeeEls.articleBody.innerHTML = `<p class="empty-state">正在连接 Supabase。</p>`;
  employeeEls.completeTaskBtn.disabled = true;
}

function renderError(message) {
  employeeEls.taskList.innerHTML = `<div class="empty-state">${TrainingStore.esc(message)}</div>`;
  employeeEls.articleTitle.textContent = "无法加载";
  employeeEls.articleStatus.textContent = "错误";
  employeeEls.articleStatus.classList.remove("is-done");
  employeeEls.articleBody.innerHTML = `<p class="empty-state">${TrainingStore.esc(message)}</p>`;
  employeeEls.completeTaskBtn.disabled = true;
}

function renderEmployeeOptions(state) {
  employeeEls.employeeSelect.innerHTML = state.employees
    .map(employee => `<option value="${TrainingStore.esc(employee.id)}">${TrainingStore.esc(employee.name)} - ${TrainingStore.esc(employee.department)}</option>`)
    .join("");
  employeeEls.employeeSelect.value = selectedEmployeeId;
}

function renderEmployeeSummary(state) {
  const done = TrainingStore.employeeCompletions(selectedEmployeeId).length;
  const total = state.tasks.length;
  const pct = TrainingStore.percent(done, total);

  employeeEls.employeeDone.textContent = `${done}/${total}`;
  employeeEls.employeePercent.textContent = `${pct}%`;
  TrainingStore.setProgress(employeeEls.employeeProgress, pct);
}

function renderTaskList(state) {
  employeeEls.taskList.innerHTML = state.tasks.length
    ? state.tasks.map(task => {
      const complete = TrainingStore.isComplete(selectedEmployeeId, task.id);
      const selected = task.id === selectedTaskId;
      return `
        <div class="task-item ${selected ? "is-selected" : ""}" data-task-id="${TrainingStore.esc(task.id)}">
          <div>
            <div class="task-title">${TrainingStore.esc(task.title)}</div>
            <div class="task-meta">
              <span>${TrainingStore.esc(task.type)}</span>
              <span>${TrainingStore.esc(task.minutes)} 分钟</span>
              <span>${complete ? "已完成" : "未完成"}</span>
            </div>
          </div>
          <button class="small-btn" type="button" data-open-task="${TrainingStore.esc(task.id)}">打开</button>
        </div>
      `;
    }).join("")
    : `<div class="empty-state">暂无培训任务</div>`;
}

function renderArticle(task) {
  if (!task) {
    employeeEls.articleTitle.textContent = "培训文章";
    employeeEls.articleBody.innerHTML = `<p class="empty-state">暂无内容</p>`;
    employeeEls.articleStatus.textContent = "未选择";
    employeeEls.articleStatus.classList.remove("is-done");
    employeeEls.completeTaskBtn.disabled = true;
    return;
  }

  const complete = TrainingStore.isComplete(selectedEmployeeId, task.id);
  employeeEls.articleTitle.textContent = task.title;
  employeeEls.articleBody.innerHTML = task.content.map(paragraph => `<p>${TrainingStore.esc(paragraph)}</p>`).join("");
  employeeEls.articleStatus.textContent = complete ? "已完成" : "未完成";
  employeeEls.articleStatus.classList.toggle("is-done", complete);
  employeeEls.completeTaskBtn.disabled = complete || saving;
  employeeEls.completeTaskBtn.lastChild.textContent = saving ? " 保存中" : " 标记完成";
}

employeeEls.employeeSelect.addEventListener("change", event => {
  selectedEmployeeId = event.target.value;
  renderEmployeePage();
});

employeeEls.taskList.addEventListener("click", event => {
  const trigger = event.target.closest("[data-open-task], .task-item");
  if (!trigger) return;
  selectedTaskId = trigger.dataset.openTask ?? trigger.dataset.taskId;
  renderEmployeePage();
});

employeeEls.completeTaskBtn.addEventListener("click", async () => {
  if (saving) return;
  saving = true;
  renderEmployeePage();
  await TrainingStore.completeTask(selectedEmployeeId, selectedTaskId);
  saving = false;
  renderEmployeePage();
});

TrainingStore.subscribe(renderEmployeePage);
renderEmployeePage();

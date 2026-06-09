const portalEls = {
  employeeLoginForm: document.querySelector("#employeeLoginForm"),
  employeeRegisterForm: document.querySelector("#employeeRegisterForm"),
  managerLoginForm: document.querySelector("#managerLoginForm"),
  message: document.querySelector("#loginMessage")
};

let submitting = false;

function setMessage(text, type = "") {
  portalEls.message.textContent = text;
  portalEls.message.classList.remove("is-error", "is-success");
  if (type) portalEls.message.classList.add(type);
}

function setSubmitting(form, value) {
  submitting = value;
  document.querySelectorAll(".auth-form button[type='submit']").forEach(button => {
    button.disabled = value;
  });
  const button = form.querySelector("button[type='submit']");
  if (!button) return;
  button.dataset.originalText ||= button.lastChild.textContent;
  button.lastChild.textContent = value ? " 处理中" : button.dataset.originalText;
}

async function handleAuth(form, action, redirectTo) {
  if (submitting) return;
  setMessage("");
  setSubmitting(form, true);

  try {
    const result = await action();
    const message = result.status === "registered" ? "注册成功，正在进入员工端。" : "登录成功，正在进入系统。";
    setMessage(message, "is-success");
    window.location.href = redirectTo;
  } catch (error) {
    console.error(error);
    setMessage(error.message || "操作失败，请稍后重试。", "is-error");
  } finally {
    setSubmitting(form, false);
  }
}

portalEls.employeeLoginForm.addEventListener("submit", event => {
  event.preventDefault();
  const username = document.querySelector("#employeeLoginUsername").value;
  const password = document.querySelector("#employeeLoginPassword").value;
  void handleAuth(
    portalEls.employeeLoginForm,
    () => TrainingStore.login(username, password),
    "./employee.html"
  );
});

portalEls.employeeRegisterForm.addEventListener("submit", event => {
  event.preventDefault();
  const username = document.querySelector("#employeeRegisterUsername").value;
  const password = document.querySelector("#employeeRegisterPassword").value;
  void handleAuth(
    portalEls.employeeRegisterForm,
    () => TrainingStore.register(username, password),
    "./employee.html"
  );
});

portalEls.managerLoginForm.addEventListener("submit", event => {
  event.preventDefault();
  const username = document.querySelector("#managerUsername").value;
  const password = document.querySelector("#managerPassword").value;
  void handleAuth(
    portalEls.managerLoginForm,
    () => TrainingStore.login(username, password),
    "./admin.html"
  );
});

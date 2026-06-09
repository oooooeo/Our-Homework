const portalEls = {
  authCard: document.querySelector("#authCard"),
  loginForm: document.querySelector("#loginForm"),
  registerForm: document.querySelector("#registerForm"),
  loginUsername: document.querySelector("#loginUsername"),
  loginPassword: document.querySelector("#loginPassword"),
  registerUsername: document.querySelector("#registerUsername"),
  registerPassword: document.querySelector("#registerPassword"),
  message: document.querySelector("#loginMessage"),
  registerSwitch: document.querySelector("#registerSwitch"),
  loginSwitch: document.querySelector("#loginSwitch"),
  showRegisterBtn: document.querySelector("#showRegisterBtn"),
  showLoginBtn: document.querySelector("#showLoginBtn")
};

let submitting = false;

function setMessage(text, type = "") {
  portalEls.message.textContent = text;
  portalEls.message.classList.remove("is-error", "is-success");
  if (type) portalEls.message.classList.add(type);
}

function authErrorMessage(error) {
  const raw = String(error?.message ?? "");
  if (raw.includes("用户名不存在") || raw.includes("not found")) {
    return "未检测到用户名，请注册新账号";
  }
  return raw || "操作失败，请稍后重试。";
}

function setMode(mode) {
  const isRegister = mode === "register";
  portalEls.authCard.dataset.mode = mode;
  portalEls.loginForm.hidden = isRegister;
  portalEls.registerForm.hidden = !isRegister;
  portalEls.registerSwitch.hidden = isRegister;
  portalEls.loginSwitch.hidden = !isRegister;
  setMessage("");

  window.requestAnimationFrame(() => {
    const input = isRegister ? portalEls.registerUsername : portalEls.loginUsername;
    input?.focus();
  });
}

function setSubmitting(form, value) {
  submitting = value;
  document.querySelectorAll(".auth-form button[type='submit']").forEach(button => {
    button.disabled = value;
  });

  const label = form.querySelector("[data-button-label]");
  if (!label) return;
  label.dataset.originalText ||= label.textContent;
  label.textContent = value ? "处理中" : label.dataset.originalText;
}

function destinationFor(result) {
  return result?.role === "manager" ? "./admin.html" : "./employee.html";
}

async function handleAuth(form, action, successMessage) {
  if (submitting) return;
  setMessage("");
  setSubmitting(form, true);

  try {
    const result = await action();
    setMessage(successMessage, "is-success");
    window.location.href = destinationFor(result);
  } catch (error) {
    console.error(error);
    setMessage(authErrorMessage(error), "is-error");
  } finally {
    setSubmitting(form, false);
  }
}

function bindPasswordToggles() {
  document.querySelectorAll("[data-toggle-password]").forEach(button => {
    button.addEventListener("click", () => {
      const input = document.querySelector(`#${button.getAttribute("aria-controls")}`);
      if (!input) return;
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      button.classList.toggle("is-visible", !showing);
      button.setAttribute("aria-label", showing ? "显示密码" : "隐藏密码");
    });
  });
}

portalEls.loginForm.addEventListener("submit", event => {
  event.preventDefault();
  const username = portalEls.loginUsername.value;
  const password = portalEls.loginPassword.value;
  void handleAuth(
    portalEls.loginForm,
    () => TrainingStore.login(username, password),
    "登录成功，正在进入系统。"
  );
});

portalEls.registerForm.addEventListener("submit", event => {
  event.preventDefault();
  const username = portalEls.registerUsername.value;
  const password = portalEls.registerPassword.value;
  void handleAuth(
    portalEls.registerForm,
    () => TrainingStore.register(username, password),
    "注册成功，正在进入员工端。"
  );
});

portalEls.showRegisterBtn.addEventListener("click", () => {
  portalEls.registerUsername.value = portalEls.loginUsername.value.trim();
  setMode("register");
});

portalEls.showLoginBtn.addEventListener("click", () => {
  portalEls.loginUsername.value = portalEls.registerUsername.value.trim();
  setMode("login");
});

bindPasswordToggles();
setMode("login");

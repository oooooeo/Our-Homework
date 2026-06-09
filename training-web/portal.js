const portalEls = {
  form: document.querySelector("#loginForm"),
  usernameInput: document.querySelector("#usernameInput"),
  message: document.querySelector("#loginMessage")
};

let loggingIn = false;

function renderExistingSession() {
  const session = TrainingStore.getSession();
  if (!session) return;
  portalEls.usernameInput.value = session.username ?? "";
  portalEls.message.textContent = session.role === "manager"
    ? "已识别后台身份，可以直接进入。"
    : "已识别员工身份，可以直接进入。";
}

function setMessage(text, type = "") {
  portalEls.message.textContent = text;
  portalEls.message.classList.remove("is-error", "is-success");
  if (type) portalEls.message.classList.add(type);
}

portalEls.form.addEventListener("submit", async event => {
  event.preventDefault();
  if (loggingIn) return;

  loggingIn = true;
  const submitButton = portalEls.form.querySelector("button[type='submit']");
  submitButton.disabled = true;
  submitButton.lastChild.textContent = " 处理中";
  setMessage("");

  try {
    const result = await TrainingStore.loginOrRegister(portalEls.usernameInput.value);
    setMessage(result.status === "registered" ? "注册成功，正在进入员工端。" : "登录成功，正在进入系统。", "is-success");
    window.location.href = result.role === "manager" ? "./admin.html" : "./employee.html";
  } catch (error) {
    console.error(error);
    setMessage(error.message || "登录失败，请稍后重试。", "is-error");
  } finally {
    loggingIn = false;
    submitButton.disabled = false;
    submitButton.lastChild.textContent = " 进入系统";
  }
});

renderExistingSession();

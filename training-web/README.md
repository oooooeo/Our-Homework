# 员工培训进度系统

这是基于仓库中 Obsidian 进度系统思路扩展出的网页原型。

## 当前版本

- 员工端：选择员工、打开培训文章、标记完成。
- 后台主页：查看员工完成率、任务完成率、总体进度条、最近完成记录。
- 新增任务：后台可以新增“培训文章”类任务。
- 数据同步：员工端和后台端通过 Supabase 共享同一份数据。
- 自动刷新：页面会定时从 Supabase 拉取最新完成记录。

## 使用方式

直接用浏览器打开入口页：

```text
training-web/index.html
```

也可以分别打开两个独立页面：

```text
training-web/employee.html
training-web/admin.html
```

如果同时打开两个窗口，一个打开员工端、一个打开后台端，员工端标记完成后，后台端会自动刷新进度。

## 数据后端

当前版本使用 Supabase 保存数据。主要数据表：

- `employees`
- `training_tasks`
- `training_completions`

当前仍是轻量版本，员工身份通过下拉框选择。正式用于培训时，建议继续接入 Supabase Auth，让员工登录后自动绑定身份。

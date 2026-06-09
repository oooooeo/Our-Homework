# 员工培训进度系统

这是基于仓库中 Obsidian 进度系统思路扩展出的网页原型。

## 当前版本

- 员工端：员工使用用户名和密码登录，打开培训文章、标记完成。
- 后台主页：查看员工完成率、任务完成率、总体进度条、最近完成记录。
- 入口登录：员工端和后台端共用同一个登录入口，用户名为 `supermanager` 时进入后台端。
- 新增任务：后台可以新增“培训文章”类任务，并设置完成截止时间。
- 撤回任务：后台可以撤回/删除误发布任务，相关完成记录和评论会同步删除。
- 员工提醒：员工端会显示新增任务、即将截止任务、逾期任务提醒。
- 任务评论：每个培训任务都有共享评论区，员工可以在同一个任务入口下讨论。
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
- `task_comments`

如果页面提示“数据库还没有启用任务截止时间/任务评论区”，需要在 Supabase 的 SQL Editor 中执行：

```text
training-web/supabase-migration-20260608-deadline-comments.sql
```

如果首次启用用户名密码注册登录，需要在 Supabase 的 SQL Editor 中执行：

```text
training-web/supabase-migration-20260609-password-auth-delete-task.sql
```

执行完成后，刷新总入口、员工端和后台端，密码登录和撤回任务会启用。

当前是轻量版本，登录状态保存在浏览器本地，密码校验由 Supabase 数据库函数完成。正式用于培训时，建议继续接入 Supabase Auth 和更完整的后台权限体系。

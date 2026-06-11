# 员工培训进度系统

这是基于仓库中 Obsidian 进度系统思路扩展出的网页原型。

## 当前版本

- 员工端：员工使用用户名和密码登录，打开培训文章、标记完成。
- 后台主页：查看员工完成率、任务完成率、总体进度条、最近完成记录。
- 入口登录：员工端和后台端共用同一个登录入口，用户名为 `supermanager` 时进入后台端。
- 部门登记：员工注册时需要选择部门，当前支持 6 个常见部门。
- 新增任务：后台可以新增“培训文章”类任务，设置完成截止时间，并定向选择目标部门。
- 学习广场：员工除了完成本部门必修任务，也可以自主学习其他部门任务。
- 员工反馈：员工端提供反馈入口，可提交满意、不满意和建议类反馈。
- 撤回任务：后台可以撤回/删除误发布任务，相关完成记录和评论会同步删除。
- 注销员工：后台可以注销离职员工，相关账号、完成记录和评论会同步删除。
- 员工提醒：员工端会显示新增任务、即将截止任务、逾期任务提醒。
- 任务评论：每个培训任务都有共享评论区，员工可以在同一个任务入口下讨论。
- 数据同步：员工端和后台端通过 Supabase 共享同一份数据。
- 自动刷新：页面会定时从 Supabase 拉取最新完成记录。

## 使用方式

直接用浏览器打开入口页：

- 线上总入口：[https://oooooeo.github.io/Our-Homework/](https://oooooeo.github.io/Our-Homework/)
- 本机总入口：[file:///C:/Users/%E6%96%B9/Documents/New%20project/Our-Homework/index.html](file:///C:/Users/%E6%96%B9/Documents/New%20project/Our-Homework/index.html)

也可以分别打开两个独立页面：

- 线上员工端：[https://oooooeo.github.io/Our-Homework/training-web/employee.html](https://oooooeo.github.io/Our-Homework/training-web/employee.html)
- 线上后台端：[https://oooooeo.github.io/Our-Homework/training-web/admin.html](https://oooooeo.github.io/Our-Homework/training-web/admin.html)
- 本机员工端：[file:///C:/Users/%E6%96%B9/Documents/New%20project/Our-Homework/training-web/employee.html](file:///C:/Users/%E6%96%B9/Documents/New%20project/Our-Homework/training-web/employee.html)
- 本机后台端：[file:///C:/Users/%E6%96%B9/Documents/New%20project/Our-Homework/training-web/admin.html](file:///C:/Users/%E6%96%B9/Documents/New%20project/Our-Homework/training-web/admin.html)

如果同时打开两个窗口，一个打开员工端、一个打开后台端，员工端标记完成后，后台端会自动刷新进度。

## 数据后端

当前版本使用 Supabase 保存数据。主要数据表：

- `employees`
- `training_tasks`
- `training_completions`
- `task_comments`
- `training_feedback`

如果页面提示“数据库还没有启用任务截止时间/任务评论区”，需要在 Supabase 的 SQL Editor 中执行：

```text
training-web/supabase-migration-20260608-deadline-comments.sql
```

如果首次启用用户名密码注册登录，需要在 Supabase 的 SQL Editor 中执行：

```text
training-web/supabase-migration-20260609-password-auth-delete-task.sql
```

如果需要启用“注册选择部门”和“后台注销员工”，需要在 Supabase 的 SQL Editor 中执行：

```text
training-web/supabase-migration-20260610-employee-department-delete.sql
```

如果需要启用“任务按部门定向发布”和“学习广场”，需要在 Supabase 的 SQL Editor 中执行：

```text
training-web/supabase-migration-20260611-target-departments.sql
```

如果需要启用“员工反馈”，需要在 Supabase 的 SQL Editor 中执行：

```text
training-web/supabase-migration-20260611-feedback.sql
```

执行完成后，刷新总入口、员工端和后台端，密码登录、撤回任务、部门登记、注销员工、定向发布、学习广场和员工反馈会启用。

当前是轻量版本，登录状态保存在浏览器本地，密码校验由 Supabase 数据库函数完成。正式用于培训时，建议继续接入 Supabase Auth 和更完整的后台权限体系。

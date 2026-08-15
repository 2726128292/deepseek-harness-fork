# @deepseek-ai/dsh-skill-manager

[English](README.md) | 中文

DeepSeek Harness 的宿主侧技能（Skill）启停管理器。

本包拥有"设置 → 技能管理"界面背后的唯一开关。它在 DeepSeek Harness 配置根目录下维护一份 JSON 禁用清单（`<dshHome>/skill-manager.json`），启动时回放到 `ctx.skills` 注册表，并立即应用每次变更。注册表本身在每一处目录与加载边界强制执行该覆盖：停用一个技能会同时从模型可见目录、`skill` 加载工具和用户显式调用中移除它；重新启用则一步恢复。

## 插件

需要 `ctx.skills`（`inject: ['skills']`）。

### 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `dshHome` | `$DSH_HOME` 或 `~/.dsh` | 由 [`@deepseek-ai/dsh-home-paths`](../../util/home-paths/README.md) 解析的 DeepSeek Harness 配置根目录。 |
| `file` | `<dshHome>/skill-manager.json` | 覆盖记录的持久化文件。 |

## 服务

提供 `ctx.skillManager`：

- `list()` — 供设置界面使用的合并目录：全局注册表层加上每个已安装 agent preset 的常驻作用域层（重名时就近层胜出），按名称排序，每一行携带当前的 `disabled` 标志以及调用与来源信息。
- `setEnabled(name, enabled)` — 更新覆盖记录、持久化并立即应用到注册表。被禁用的名称会从所有目录快照中隐藏，加载时返回 `undefined`，因此模型目录、`skill` 工具与用户调用会同时停止看到它。

## 持久化

禁用清单以 `{ "version": 1, "disabled": ["name", ...] }` 形式存放在 `<dshHome>/skill-manager.json`，通过临时文件 + 重命名原子写入。文件缺失表示未禁用任何技能；文件损坏时忽略并告警，避免一条损坏的清单把所有技能都隐藏掉。

## 模型体验

间接通过 `dsh-skill` 与 `dsh-tool-skill` 体现：它们查询注册表，被禁用的技能会从持久会话目录与 `skill` 加载工具中消失，无需任何逐技能文案；设置界面报告相同的禁用标志。

## 已知限制与待办

- **覆盖记录仅以技能名称为键** —— 两个提供同名技能来源共享同一个开关，与注册表按名称合并的目录语义一致。
- **项目技能仅通过 preset 层列出** —— 合并目录读取每个已安装 preset 的常驻作用域；没有活跃 preset 的项目根目录不会被扫描（缺少 cwd）。
- **不监听外部文件变更** —— 手工编辑 `skill-manager.json` 在下一次进程启动（或下一次 `setEnabled` 写入）后生效。

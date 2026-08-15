# @deepseek-ai/dsh-client-ui-settings-skill-manager

[English](README.md) | 中文

Web 设置中的技能管理页面：浏览宿主解析到的所有技能，查看其调用面与来源信息，并切换持久化的启用/停用覆盖记录。

## 浏览器插件

需要 `slots`、`locale` 与 `connection`。注册一个 `settings.section` 导航条目（`skills`，顺序 20），渲染技能管理页面。

### 注入面

- `list()` — 合并后的技能目录（全局注册表层加上每个已安装 agent preset 的常驻作用域层），携带当前禁用标志，由宿主 `skillManager.list` 域提供。
- `setEnabled(name, enabled)` — 通过宿主 `skillManager.setEnabled` 域设置或清除持久化的停用覆盖。

## 模型体验

开关与宿主技能管理器通信，后者将覆盖应用到 `ctx.skills` 注册表：被停用的技能会立即从模型可见目录、`skill` 加载工具与用户调用中消失；设置页开关始终与注册表状态一致（乐观更新，失败回滚）。

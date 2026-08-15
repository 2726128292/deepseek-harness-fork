# @deepseek-ai/dsh-client-ui-settings-skill-plaza

[English](README.md) | 中文

技能广场设置页面：浏览、搜索并一键安装 GitHub 上的热门技能。

## 浏览器插件

需要 `slots`、`locale` 与 `connection`。注册一个 `settings.section` 导航条目（`plaza`，顺序 25），渲染技能广场页面。

### 注入面

- `list()` — 合并后的广场目录（中英双语精选索引 + 自动发现的 GitHub 技能），由宿主 `plaza.list` 域提供。
- `install(id)` — 通过宿主 `plaza.install` 域把技能下载到用户技能根目录；文件监听器会立即发现它。
- `refresh()` — 通过宿主 `plaza.refresh` 域强制刷新目录。

## 模型体验

安装后的技能立即出现在"技能管理"中，与本地技能行为一致：模型目录、`skill` 工具与 `/名称` 调用无需重启即可使用。技能展示跟随界面语言（索引提供中文名/描述时显示中文）。

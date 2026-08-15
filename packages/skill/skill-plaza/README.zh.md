# @deepseek-ai/dsh-skill-plaza

[English](README.md) | 中文

技能广场：浏览、搜索并一键安装 GitHub 上的热门技能，入口在设置页。

本包拥有"设置 → 技能广场"界面的宿主侧实现。它合并两层目录：

- **精选层** —— 一份中英双语的优质热门技能索引。权威副本存放在 GitHub（`skill-plaza/plaza.json`，带 TTL 缓存拉取）；内置兜底索引让广场在离线时也能使用。
- **自动发现层** —— 从 GitHub 自动发现的技能：知名技能仓库 + 通过搜索 API 找到的仓库，用 git-trees 接口枚举其技能并以 star 排序。

## 插件

提供 `ctx.plaza`。无需强制注入——安装根目录由配置解析（默认 `<dshHome>/skills`）。

### 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `dshHome` | `$DSH_HOME` 或 `~/.dsh` | DeepSeek Harness 配置根目录。 |
| `skillRoot` | `<dshHome>/skills` | 下载技能的安装根目录。 |
| `indexUrl` | `https://raw.githubusercontent.com/2726128292/deepseek-harness-fork/master/skill-plaza/plaza.json` | 精选索引地址（也可用 `$DSH_SKILL_PLAZA_INDEX`）。 |
| `cacheTtlMs` | `3600000` | 目录缓存 TTL，到期后重新抓取。 |
| `githubToken` | `$DSH_GITHUB_TOKEN` | 可选的 GitHub token，用于提升 API 限速。 |

## 服务

- `list()` —— 合并目录：精选条目在前（中英双语），随后是按仓库 star 排序的自动发现技能；每个条目都带当前的 `installed` 标记。
- `install(id)` —— 从来源仓库下载某个技能目录（SKILL.md 及其资源）到技能根目录。skill-filesystem 监听器会立即发现它，无需重启。
- `refresh()` —— 清空 TTL 缓存，下次读取会重新拉取索引并重新发现 GitHub 技能（"实时刷新"）。

## 安装

安装使用 GitHub git-trees API（按仓库缓存）列出技能目录，再从 `raw.githubusercontent.com` 逐个下载文件。目标目录已存在 `SKILL.md` 时拒绝安装，避免覆盖。

## 已知限制与待办

- **自动发现条目描述较简** —— 未安装前显示来源仓库；安装后技能管理界面会显示真实 `SKILL.md` frontmatter。
- **匿名 GitHub 限速** —— 无 token 时仓库搜索与 trees 接口受限；小时级 TTL 保证广场可用，配置 `DSH_GITHUB_TOKEN` 可解除限制。
- **按名称安装** —— 两个发现来源同名技能时保留 star 更高者；技能根目录已存在同名技能时拒绝安装。

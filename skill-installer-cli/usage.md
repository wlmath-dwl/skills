# skill-installer-cli 使用指南

从 Git 仓库安装 skill 到多种 Agent（kiro/claude/codex/cursor）。

默认仓库地址：`https://git.lianjia.com/gaoran007/skills`

## 安装

### 下载预编译二进制

```bash
curl -L "https://git.lianjia.com/gaoran007/skills/-/raw/master/skill-installer-cli/skill-installer-cli?ref_type=heads&inline=false" -o ./skill-installer-cli && chmod +x ./skill-installer-cli
```

## 支持的 Agent

| Agent  | Skills 目录         |
|--------|---------------------|
| kiro   | `~/.kiro/skills`    |
| claude | `~/.claude/skills`  |
| codex  | `~/.codex/skills`   |
| cursor | `~/.cursor/skills`  |

## 命令

### install — 从 Git 仓库安装 skill

```bash
skill-installer-cli install [source] [flags]
```

不指定 `source` 时使用内部默认仓库。

支持的 source 格式：

| 格式 | 示例 |
|------|------|
| GitHub shorthand | `owner/repo` |
| 完整 URL | `https://github.com/owner/repo` |
| SSH URL | `git@github.com:owner/repo.git` |

| Flag | 缩写 | 说明 |
|------|------|------|
| `--repo` | `-r` | Git 仓库地址（覆盖 source 参数） |
| `--skill` | `-s` | 指定 skill 名称（可多次使用） |
| `--agent` | `-a` | 指定目标 Agent（可多次使用，如 kiro/claude/codex/cursor） |
| `--local` | `-l` | 安装到当前项目目录（默认安装到用户目录） |

示例：

```bash
# 从默认仓库安装指定 skill
skill-installer-cli install --skill ones-task

# 安装多个 skill
skill-installer-cli install --skill ones-task --skill find-skills

# 指定目标 Agent（跳过交互选择）
skill-installer-cli install --skill ones-task --agent kiro --agent claude

# 从 GitHub 仓库安装
skill-installer-cli install anthropics/skills --skill find-skills

# 完整 URL
skill-installer-cli install https://github.com/vercel-labs/agent-skills --skill web-design-guidelines

# 安装到当前项目目录
skill-installer-cli install --local --skill ones-task
```

不指定 `--skill` 时会列出仓库中所有可用 skill 并全部安装。不指定 `--agent` 时会弹出交互式选择器：

```
选择 Agent (↑↓移动  Tab/空格切换  Enter确认):
> [✓] kiro   (.kiro/skills)
  [ ] claude (.claude/skills)
  [ ] codex  (.codex/skills)
  [ ] cursor (.cursor/skills)
```

自动搜索仓库中以下位置的 skill：
- 根目录（如果包含 SKILL.md）
- `skill/`、`skills/`
- `.agents/skills/`
- `.claude/skills/`、`.kiro/skills/`
- `.codex/skills/`、`.cursor/skills/`

### copy — 在 Agent 之间复制 skill

```bash
skill-installer-cli copy --from <agent> --to <agent> [flags]
```

| Flag | 缩写 | 说明 |
|------|------|------|
| `--from` | | 源 Agent 名称（必填） |
| `--to` | | 目标 Agent 名称（必填） |
| `--skill` | `-s` | 指定要复制的 skill（可多次使用，不指定则复制全部） |
| `--local` | `-l` | 使用当前项目目录（默认用户目录） |

示例：

```bash
# 复制单个 skill
skill-installer-cli copy --from claude --to kiro --skill ones-task

# 复制全部 skill
skill-installer-cli copy --from kiro --to cursor

# 使用当前项目目录
skill-installer-cli copy --from claude --to kiro --local
```

### list — 列出已安装的 skill

```bash
skill-installer-cli list [flags]
```

| Flag | 缩写 | 说明 |
|------|------|------|
| `--dir` | `-d` | 指定目录（不指定则列出所有 Agent） |

示例：

```bash
# 列出所有 Agent 的 skill
skill-installer-cli list

# 列出指定目录
skill-installer-cli list -d ./.kiro/skills
```

输出示例：

```
[kiro] /Users/you/.kiro/skills
  • ones-task
  • lark-calendar
  共 2 个 skill

[claude] /Users/you/.claude/skills
  • ones-task
  共 1 个 skill
```

## 依赖

- Go 1.21+
- Git

## 注意事项

- 安装/更新 skill 后需重启对应 Agent 才能生效
- 相对路径会自动转为绝对路径
- 仓库中必须存在 `<skill-name>/SKILL.md` 才视为有效 skill

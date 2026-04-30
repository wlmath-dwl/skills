---
name: skill-installer-cli
description: >
  从 Git 仓库安装 skill 到多种 Agent（kiro/claude/codex/cursor）。
  触发关键词：安装 skill、从 git 安装、skill 安装。
---

# Skill Installer CLI

从 Git 仓库安装 skill，支持多种 Agent（kiro、claude、codex、cursor）。

安装时交互选择目标 Agent，一次克隆即可同时安装到多个 Agent 的 skills 目录。

默认仓库地址：`https://git.lianjia.com/gaoran007/skills`

## 用法

```bash
# 从 GitHub 仓库安装 skill（兼容 skills.sh 生态）
skill-installer-cli add owner/repo --skill skill-name
skill-installer-cli add https://github.com/vercel-labs/agent-skills --skill frontend-design
skill-installer-cli add anthropics/skills  # 交互选择

# 安装 skill（使用默认仓库）
skill-installer-cli install <skill-name>

# 指定自定义仓库
skill-installer-cli install <skill-name> -r <git-repo-url>

# 指定分支
skill-installer-cli install <skill-name> -b develop

# 安装到指定目录
skill-installer-cli install <skill-name> -t <target-dir>

# 列出所有 Agent 已安装的 skills
skill-installer-cli list

# 列出指定目录的 skills
skill-installer-cli list -d <dir>
```

## 支持的 Agent

| Agent  | Skills 目录         |
|--------|---------------------|
| kiro   | `~/.kiro/skills`    |
| claude | `~/.claude/skills`  |
| codex  | `~/.codex/skills`   |
| cursor | `~/.cursor/skills`  |

## 构建

一键安装：

```bash
bash <(curl -fsSL https://git.lianjia.com/gaoran007/skills/raw/master/skill-installer-cli/install.sh)
```

手动构建：

```bash
cd skill-installer-cli
go build -o skill-installer-cli .
```

## 命令

### add — 从 GitHub 仓库安装 skill

兼容 [skills.sh](https://skills.sh/) 生态，类似 `npx skills add`。

```bash
skill-installer-cli add <source> [--skill <name>] [--local]
```

支持的 source 格式：

| 格式 | 示例 |
|------|------|
| GitHub shorthand | `owner/repo` |
| 完整 GitHub URL | `https://github.com/owner/repo` |
| SSH URL | `git@github.com:owner/repo.git` |

| Flag | 缩写 | 说明 |
|------|------|------|
| `--skill` | `-s` | 指定 skill 名称（可多次使用） |
| `--local` | `-l` | 安装到当前项目目录（默认安装到用户目录） |

自动搜索仓库中以下位置的 skill：根目录、`skills/`、`.agents/skills/`、`.claude/skills/`、`.kiro/skills/`、`.codex/skills/`、`.cursor/skills/`

## 依赖

- Go 1.21+
- Git

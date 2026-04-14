# skill-installer-cli 使用指南

从 Git 仓库安装 skill 到多种 Agent（kiro/claude/codex/cursor）。

默认仓库地址：`https://git.lianjia.com/gaoran007/skills`

## 安装

一键安装（需要 Go 和 Git）：

```bash
bash <(curl -fsSL https://git.lianjia.com/gaoran007/skills/raw/master/skill-installer-cli/install.sh)
```

或手动构建：

```bash
cd skill-installer-cli
go build -o skill-installer-cli .
mv skill-installer-cli /usr/local/bin/
```

## 支持的 Agent

| Agent  | Skills 目录         |
|--------|---------------------|
| kiro   | `~/.kiro/skills`    |
| claude | `~/.claude/skills`  |
| codex  | `~/.codex/skills`   |
| cursor | `~/.cursor/skills`  |

## 命令

### install — 安装 skill

```bash
skill-installer-cli install <skill-name> [flags]
```

| Flag | 缩写 | 默认值 | 说明 |
|------|------|--------|------|
| `--repo` | `-r` | `https://git.lianjia.com/gaoran007/skills` | Git 仓库地址 |
| `--branch` | `-b` | `master` | Git 分支 |
| `--target` | `-t` | (无) | 指定目录，跳过 Agent 选择 |

不指定 `-t` 时，会交互提示选择目标 Agent：

```
选择 Agent (↑↓移动  Tab/空格切换  Enter确认):
> [✓] kiro   (.kiro/skills)
  [ ] claude (.claude/skills)
  [ ] codex  (.codex/skills)
  [ ] cursor (.cursor/skills)
```

示例：

```bash
# 使用默认仓库安装
skill-installer-cli install ones-task

# 自定义仓库
skill-installer-cli install ones-task -r https://git.example.com/skills

# 指定分支
skill-installer-cli install ones-task -b develop

# 直接安装到指定目录
skill-installer-cli install ones-task -t ./.kiro/skills
```

安装流程：

1. 交互选择目标 Agent（或通过 `-t` 指定目录）
2. 克隆指定分支到临时目录（只克隆一次）
3. 校验 skill 目录和 `SKILL.md` 是否存在
4. 复制到每个选中 Agent 的 skills 目录
5. 清理临时文件

### list — 列出已安装的 skills

```bash
skill-installer-cli list [flags]
```

| Flag | 缩写 | 默认值 | 说明 |
|------|------|--------|------|
| `--dir` | `-d` | (无) | 指定目录，不指定则列出所有 Agent |

示例：

```bash
# 列出所有 Agent 的 skills
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

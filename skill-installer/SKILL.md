---
name: skill-installer
description: >
  从 Git 仓库安装 skill 到 Kiro CLI。
  触发关键词：安装 skill、从 git 安装、skill 安装。
---

# 安装 Skill

从 Git 仓库安装 skill 到 Kiro CLI。

## 用法

```
/skill-installer <git-repo-url> <skill-name> [branch] [target-dir]
```

例如：

```
# 安装到全局 Kiro 目录（默认）
/skill-installer https://git.lianjia.com/gaoran007/skills ones-task master

# 安装到当前项目 .kiro 目录
/skill-installer https://git.lianjia.com/gaoran007/skills ones-task master ./.kiro/skills
```

## 工作原理

1. 从指定 Git 仓库克隆 skill
2. 复制 skill 到目标目录（默认 `~/.kiro/skills/`）
3. 如果已存在同名 skill，会自动替换
4. 自动验证 SKILL.md 文件存在

## 依赖

- Git
- Bash

## 注意事项

- 修改 skill 后需要重启 Kiro CLI 才能生效
- 第四个参数是可选的目标目录路径
- 当使用 `./.kiro/skills` 或 `./kiro/skills` 时，会自动创建目录

## 执行步骤

直接运行脚本：

```bash
bash ~/.kiro/skills/skill-installer/scripts/install.sh "$ARGUMENTS"
```

脚本会自动完成：
1. 解析命令行参数（仓库 URL、skill 名称、分支、目标目录）
2. 克隆 Git 仓库到临时目录
3. 验证 SKILL.md 文件存在
4. 复制到目标目录（自动替换已存在的同名 skill）
5. 清理临时文件

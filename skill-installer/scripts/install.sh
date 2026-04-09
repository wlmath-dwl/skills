#!/bin/bash

# 从 Git 仓库安装 skill 到 Kiro

set -e

REPO_URL="$1"
SKILL_NAME="$2"
BRANCH="${3:-main}"
TARGET_DIR="${4:-$HOME/.kiro/skills}"

TEMP_DIR=$(mktemp -d)

# 检查参数
if [[ -z "$REPO_URL" || -z "$SKILL_NAME" ]]; then
    echo "用法: $0 <git-repo-url> <skill-name> [branch] [target-dir]"
    echo "示例: $0 https://github.com/your/skills-repo.git ones-task main"
    echo "      $0 https://github.com/your/skills-repo.git ones-task main ./.kiro/skills"
    exit 1
fi

echo "正在安装 skill: $SKILL_NAME"
echo "Git 仓库: $REPO_URL (分支: $BRANCH)"
echo "目标目录: $TARGET_DIR"

# 如果目标目录是相对路径（以 ./ 或 .kiro 开头），转换为绝对路径
if [[ "$TARGET_DIR" == ./* ]] || [[ "$TARGET_DIR" == .kiro/* ]]; then
    TARGET_DIR="$(pwd)/$TARGET_DIR"
fi

# 克隆整个仓库
echo "克隆仓库到临时目录..."
git clone -b "$BRANCH" "$REPO_URL" "$TEMP_DIR/repo" 2>/dev/null || {
    echo "错误: 克隆失败，请检查 URL 和分支"
    exit 1
}

# 检查 skill 目录是否存在
if [[ ! -d "$TEMP_DIR/repo/$SKILL_NAME" ]]; then
    echo "错误: 仓库中不存在 skill 目录 '$SKILL_NAME'"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# 检查 skill 目录结构
if [[ ! -f "$TEMP_DIR/repo/$SKILL_NAME/SKILL.md" ]]; then
    echo "错误: 缺少 SKILL.md 文件，不是有效的 skill 目录"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# 创建目标目录（包括父目录）
mkdir -p "$TARGET_DIR"

# 如果已存在，先删除
if [[ -d "$TARGET_DIR/$SKILL_NAME" ]]; then
    echo "已存在同名 skill，正在替换..."
    rm -rf "$TARGET_DIR/$SKILL_NAME"
fi

# 复制到目标目录
echo "安装到 $TARGET_DIR..."
cp -r "$TEMP_DIR/repo/$SKILL_NAME" "$TARGET_DIR/"

# 清理
rm -rf "$TEMP_DIR"

echo "✓ Skill '$SKILL_NAME' 安装完成！"
echo "  位置: $TARGET_DIR/$SKILL_NAME"
echo ""
echo "提示: 修改 skill 后需要重启 Kiro CLI 才能生效"

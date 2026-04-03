#!/usr/bin/env bash
# 用法: fetch-task-with-feishu.sh <ONES任务页面URL>
# 功能: 获取 ONES 工作项详情，并自动提取描述中的飞书链接获取内容

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FETCH_SCRIPT="$SCRIPT_DIR/fetch-task.sh"

INPUT="${1:-}"

if [[ -z "$INPUT" ]]; then
  echo "用法: $0 <ONES任务页面URL>" >&2
  exit 1
fi

# 先获取 ONES 工作项详情
echo ">>> 获取 ONES 工作项详情..."
TASK_OUTPUT=$(bash "$FETCH_SCRIPT" "$INPUT")
echo "$TASK_OUTPUT"
echo

# 提取飞书链接
# 支持格式: https://xxx.feishu.cn/docx/XXX, https://xxx.feishu.cn/sheets/XXX, https://xxx.feishu.cn/wiki/XXX
FEISHU_LINKS=$(echo "$TASK_OUTPUT" | grep -oE 'https://[a-zA-Z0-9.-]+\.feishu\.cn/(docx|sheets|wiki)/[A-Za-z0-9]+' || true)

if [[ -z "$FEISHU_LINKS" ]]; then
  echo ">>> 未发现飞书文档链接"
  exit 0
fi

echo ">>> 发现飞书文档链接，开始获取内容..."

# 检查 feishu CLI 是否可用
if ! command -v feishu &> /dev/null; then
  echo "警告: feishu CLI 未安装，无法获取飞书文档内容" >&2
  echo "请参考: https://github.com/UnionAI/feishu-cli" >&2
  exit 0
fi

# 检查 feishu 是否已授权
FEISHU_AUTH_STATUS=$(feishu auth status 2>/dev/null || echo '{"error":"未授权"}')
if echo "$FEISHU_AUTH_STATUS" | grep -q '"error"'; then
  echo "警告: feishu CLI 未授权，请运行 'feishu auth device-flow' 进行授权" >&2
  exit 0
fi

# 逐个获取飞书文档内容
while IFS= read -r link; do
  [[ -z "$link" ]] && continue

  echo ""
  echo "=== 飞书文档: $link ==="

  # 解析链接类型和 token
  if [[ "$link" =~ feishu\.cn/(docx|sheets|wiki)/([A-Za-z0-9]+) ]]; then
    DOC_TYPE="${BASH_REMATCH[1]}"
    DOC_TOKEN="${BASH_REMATCH[2]}"

    case "$DOC_TYPE" in
      docx)
        echo ">>> 获取云文档内容..."
        feishu doc fetch "$DOC_TOKEN" 2>/dev/null | head -200 || echo "获取失败"
        ;;
      sheets)
        echo ">>> 获取电子表格信息..."
        feishu sheets info --spreadsheet_token "$DOC_TOKEN" 2>/dev/null || echo "获取失败"
        ;;
      wiki)
        echo ">>> 获取知识库节点信息..."
        feishu wiki node get "$DOC_TOKEN" 2>/dev/null || echo "获取失败"
        ;;
    esac
  fi
done <<< "$FEISHU_LINKS"

echo ""
echo ">>> 完成"
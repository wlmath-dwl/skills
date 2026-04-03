#!/usr/bin/env bash
# 用法: fetch-task.sh <ONES任务页面URL>
# 依赖: curl, python3
# Token 存储于 .claude/skills/ones-task/token

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOKEN_FILE="$SCRIPT_DIR/../token"
USER_ID_FILE="$SCRIPT_DIR/../user-id"

INPUT="${1:-}"

if [[ -z "$INPUT" ]]; then
  echo "用法: $0 <ONES任务页面URL>" >&2
  exit 1
fi

# 从文件读取 token
if [[ -f "$TOKEN_FILE" ]]; then
  ONES_TOKEN=$(tr -d '[:space:]' < "$TOKEN_FILE")
fi

if [[ -z "${ONES_TOKEN:-}" ]]; then
  echo "错误：Token 未设置，请将 token 写入：$TOKEN_FILE" >&2
  echo "详见 .claude/skills/ones-task/token-update.md" >&2
  exit 1
fi

# 从文件读取 user-id
if [[ -f "$USER_ID_FILE" ]]; then
  ONES_USER_ID=$(tr -d '[:space:]' < "$USER_ID_FILE")
fi

if [[ -z "${ONES_USER_ID:-}" ]]; then
  echo "错误：Ones-User-Id 未设置，请将 user-id 写入：$USER_ID_FILE" >&2
  echo "详见 .claude/skills/ones-task/token-update.md" >&2
  exit 1
fi

ONES_HOST="https://ones.realsee.com"

read -r ONES_TEAM_UUID TASK_UUID <<< "$(python3 -c "
import re, sys
url = sys.argv[1]
team = (re.search(r'/team/([A-Za-z0-9]+)', url) or type('', (), {'group': lambda *a: ''})()).group(1)
task = (re.search(r'/task/([A-Za-z0-9]+)', url) or type('', (), {'group': lambda *a: ''})()).group(1)
print(team, task)
" "$INPUT")"

if [[ -z "$ONES_TEAM_UUID" || -z "$TASK_UUID" ]]; then
  echo "错误：无法从 URL 中解析 team UUID 或 task UUID，请确认 URL 格式正确。" >&2
  exit 1
fi

TASK_JSON=$(curl -s -X GET \
  "${ONES_HOST}/project/api/project/team/${ONES_TEAM_UUID}/task/${TASK_UUID}/info" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${ONES_TOKEN}" \
  -H "Ones-User-Id: ${ONES_USER_ID}" \
  -H "Referer: ${ONES_HOST}/project/" \
  -H 'cache-control: no-cache')

MESSAGES_JSON=$(curl -s -X GET \
  "${ONES_HOST}/project/api/project/team/${ONES_TEAM_UUID}/task/${TASK_UUID}/messages?since=0&max=9999999999999999&count=100" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${ONES_TOKEN}" \
  -H "Ones-User-Id: ${ONES_USER_ID}" \
  -H "Referer: ${ONES_HOST}/project/" \
  -H 'cache-control: no-cache')

python3 - "$TASK_JSON" "$MESSAGES_JSON" <<'PYEOF'
import sys
import json
from datetime import datetime, timezone, timedelta

task_raw = sys.argv[1]
msgs_raw = sys.argv[2]

# 检查 API 错误
try:
    task = json.loads(task_raw)
except Exception:
    print("错误：任务接口返回非 JSON 内容：", task_raw[:200])
    sys.exit(1)

if "code" in task and task["code"] != 200:
    print(f"错误：API 返回 {task.get('code')} {task.get('errcode', '')}，请检查 Token 是否过期。")
    sys.exit(1)

try:
    msgs = json.loads(msgs_raw)
except Exception:
    print("错误：评论接口返回非 JSON 内容：", msgs_raw[:200])
    sys.exit(1)

# 提取任务信息
number = task.get("number", "")
summary = task.get("summary", "（无标题）")
desc = (task.get("desc") or "").strip().replace("[image]", "[图片]")

# 过滤评论，按时间正序
CST = timezone(timedelta(hours=8))
discussions = [m for m in msgs.get("messages", []) if m.get("type") == "discussion"]
discussions.sort(key=lambda m: m.get("send_time", 0))

print(f"## 工作项 #{number}\n")
print(f"**标题：** {summary}\n")
print("**描述：**")
print(desc if desc else "（无描述）")
print()

if discussions:
    print(f"**评论（共 {len(discussions)} 条）：**\n")
    for i, m in enumerate(discussions, 1):
        ts = m.get("send_time", 0) // 1_000_000
        dt = datetime.fromtimestamp(ts, tz=CST).strftime("%Y-%m-%d %H:%M")
        sender = m.get("from_name") or m.get("from", "")
        text = (m.get("text") or "").strip().replace("[ul]", "").strip()
        print(f"[{i}] {sender} · {dt}")
        print(text)
        print()
else:
    print("**评论：**（暂无评论）")
PYEOF

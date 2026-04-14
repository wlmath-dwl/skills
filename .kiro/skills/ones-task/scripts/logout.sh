#!/usr/bin/env bash
# 用法: logout.sh
# 清除 token 文件

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$SCRIPT_DIR/.."
TOKEN_FILE="$SKILL_DIR/token"

# 调用登出 API（可选）
if [[ -f "$TOKEN_FILE" ]]; then
  # 读取配置获取 host
  ONES_CLI_CONFIG="${HOME}/.ones-cli/config.yaml"
  if [[ -f "$ONES_CLI_CONFIG" ]]; then
    HOST=$(grep -E '^\s*host:' "$ONES_CLI_CONFIG" | head -1 | awk '{print $2}' | tr -d '[:space:]')
    TOKEN=$(tr -d '[:space:]' < "$TOKEN_FILE")

    if [[ -n "$HOST" && -n "$TOKEN" ]]; then
      echo "正在调用登出 API..."
      curl -s -X GET \
        "${HOST}/project/api/project/auth/logout" \
        -H "Ones-Auth-Token: ${TOKEN}" \
        -H "Referer: ${HOST}/" \
        || true
    fi
  fi

  # 清除 token
  rm -f "$TOKEN_FILE"
  echo "Token 已清除: $TOKEN_FILE"
else
  echo "Token 文件不存在，无需登出"
fi

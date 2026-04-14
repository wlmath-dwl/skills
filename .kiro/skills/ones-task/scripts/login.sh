#!/usr/bin/env bash
# 用法: login.sh [-e email] [-p password]
# 从命令行参数或 config.yaml 读取 email/password，调用登录 API 获取 token
# 如果未提供参数，则从 skill 目录下的 config.yaml 读取

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$SCRIPT_DIR/.."
TOKEN_FILE="$SKILL_DIR/token"
USER_ID_FILE="$SKILL_DIR/user-id"
ONES_CLI_CONFIG="$SKILL_DIR/config.yaml"

# 解析命令行参数
EMAIL=""
PASSWORD=""
HOST="https://ones.realsee.com"

while getopts "e:p:h:" opt; do
  case $opt in
    e) EMAIL="$OPTARG" ;;
    p) PASSWORD="$OPTARG" ;;
    h) HOST="$OPTARG" ;;
    \?) exit 1 ;;
  esac
done

# 如果命令行未提供，则从配置文件读取
if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  if [[ ! -f "$ONES_CLI_CONFIG" ]]; then
    echo "错误：未找到配置文件: $ONES_CLI_CONFIG" >&2
    echo "请使用 -e <email> -p <password> 参数登录" >&2
    exit 1
  fi

  if [[ -z "$EMAIL" ]]; then
    EMAIL=$(grep -E '^\s*email:' "$ONES_CLI_CONFIG" | head -1 | sed 's/.*email: *//' | tr -d '[:space:]' | sed 's/^["'"'"']//;s/["'"'"']$//')
  fi
  if [[ -z "$PASSWORD" ]]; then
    PASSWORD=$(grep -E '^\s*password:' "$ONES_CLI_CONFIG" | head -1 | sed 's/.*password: *//' | tr -d '[:space:]' | sed 's/^["'"'"']//;s/["'"'"']$//')
  fi
  # 读取 host（可选）
  CONFIG_HOST=$(grep -E '^\s*host:' "$ONES_CLI_CONFIG" | head -1 | awk '{print $2}' | tr -d '[:space:]')
  if [[ -n "$CONFIG_HOST" ]]; then
    HOST="$CONFIG_HOST"
  fi
fi

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "错误：缺少认证信息" >&2
  echo "用法: login.sh -e <email> -p <password> [-h <host>]" >&2
  exit 1
fi

echo "使用 email/password 登录到 ONES: $HOST"
echo "Email: $EMAIL"

RESPONSE=$(curl -s -X POST \
  "${HOST}/project/api/project/auth/login" \
  -H 'Content-Type: application/json' \
  -H "Referer: ${HOST}/" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")

echo "Response: $RESPONSE"

TOKEN=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('token',''))" 2>/dev/null || echo "")
USER_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('uuid',''))" 2>/dev/null || echo "")

if [[ -z "$TOKEN" ]]; then
  echo "错误：登录失败" >&2
  echo "$RESPONSE" >&2
  exit 1
fi

# 写入 token 文件
echo "$TOKEN" > "$TOKEN_FILE"
echo "Token 已更新"

# 写入 user-id 文件
if [[ -n "$USER_ID" ]]; then
  echo "$USER_ID" > "$USER_ID_FILE"
  echo "User ID 已更新"
fi

echo "登录成功！"
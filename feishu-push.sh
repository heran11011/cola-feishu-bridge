#!/bin/bash
# feishu-push.sh — 飞书主动推送脚本
#
# 用途：让桥接服务主动给飞书用户发消息
#
# 用法：
#   ./feishu-push.sh "消息内容"                    # 发给默认用户（需先设置 DEFAULT_OPEN_ID）
#   ./feishu-push.sh "消息内容" "ou_xxxxxx"        # 发给指定 open_id
#
# 获取 open_id：在飞书里给机器人发一条消息，服务端日志里会打出：
#   [message] From ou_xxxxxx (text): ...
#
# 环境变量：
#   DEFAULT_OPEN_ID — 默认推送目标，可在此处修改或在 .env 中设置

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 加载 .env（如果存在）
if [ -f "${SCRIPT_DIR}/.env" ]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' "${SCRIPT_DIR}/.env" | xargs)
fi

TEXT="${1:?用法: $0 \"消息内容\" [open_id]}"
OPEN_ID="${2:-${DEFAULT_OPEN_ID:-}}"

if [ -z "$OPEN_ID" ]; then
  echo "❌ 未指定 open_id。请作为第二个参数传入，或在 .env 中设置 DEFAULT_OPEN_ID。"
  echo "   获取方式：在飞书给机器人发消息，查看服务端日志。"
  exit 1
fi

node -e "
  var j = JSON.stringify({ openId: process.argv[1], text: process.argv[2] });
  require('fs').writeFileSync(process.argv[3], j);
" "$OPEN_ID" "$TEXT" "${SCRIPT_DIR}/push-api.json"
echo "✅ 推送请求已写入，桥接服务将在 2 秒内发送..."

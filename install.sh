#!/bin/bash
# install.sh — Cola Feishu Bridge 一键安装脚本
# https://github.com/heran11011/cola-feishu-bridge

set -e

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║       Cola Feishu Bridge — 安装向导              ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${RESET}"
echo ""

# ── Step 1: 检查 Node.js ──────────────────────────────────────────────────────

echo -e "${BOLD}[1/4] 检查 Node.js 版本...${RESET}"

if ! command -v node &>/dev/null; then
  echo -e "${RED}❌ 未找到 Node.js。${RESET}"
  echo ""
  echo "请安装 Node.js 22 或更高版本："
  echo "  • 官方下载：https://nodejs.org"
  echo "  • 使用 nvm：curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
  echo "             nvm install 22 && nvm use 22"
  exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

if [ "$NODE_MAJOR" -lt 22 ]; then
  echo -e "${RED}❌ Node.js 版本过低：v${NODE_VERSION}（需要 >= 22）${RESET}"
  echo ""
  echo "请升级 Node.js："
  echo "  • 官方下载：https://nodejs.org"
  echo "  • 使用 nvm：nvm install 22 && nvm use 22"
  exit 1
fi

echo -e "${GREEN}✅ Node.js v${NODE_VERSION}${RESET}"

# ── Step 2: 安装依赖 ──────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}[2/4] 安装 npm 依赖...${RESET}"
npm install
echo -e "${GREEN}✅ 依赖安装完成${RESET}"

# ── Step 3: 配置 .env ─────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}[3/4] 配置飞书凭证...${RESET}"

if [ -f ".env" ]; then
  echo -e "${YELLOW}⚠️  .env 文件已存在，跳过创建。${RESET}"
  echo "   如需重新配置，请手动编辑 .env 文件。"
else
  cp .env.example .env

  echo ""
  echo -e "请到飞书开放平台创建应用并获取凭证："
  echo -e "  ${BOLD}https://open.feishu.cn/app${RESET}"
  echo ""
  echo "创建应用后，需要完成以下配置："
  echo "  1. 获取 App ID 和 App Secret"
  echo "  2. 添加「机器人」能力"
  echo "  3. 开启权限：im:message / im:message:send_as_bot / im:resource / im:chat"
  echo "  4. 事件订阅：回调模式选「长连接」，订阅 im.message.receive_v1"
  echo "  5. 发布应用"
  echo ""

  read -r -p "请输入 App ID（格式：cli_xxx...）: " INPUT_APP_ID
  read -r -s -p "请输入 App Secret: " INPUT_APP_SECRET
  echo ""

  if [ -n "$INPUT_APP_ID" ] && [ -n "$INPUT_APP_SECRET" ]; then
    sed -i.bak "s/your_app_id/${INPUT_APP_ID}/" .env
    sed -i.bak "s/your_app_secret/${INPUT_APP_SECRET}/" .env
    rm -f .env.bak
    echo -e "${GREEN}✅ .env 配置完成${RESET}"
  else
    echo -e "${YELLOW}⚠️  未输入凭证，请手动编辑 .env 文件后再启动。${RESET}"
  fi
fi

# ── Step 4: 使脚本可执行 ──────────────────────────────────────────────────────

chmod +x feishu-push.sh 2>/dev/null || true

# ── 完成 ──────────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}[4/4] 安装完成！${RESET}"
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}║  ✅ Cola Feishu Bridge 安装成功                  ║${RESET}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${RESET}"
echo ""
echo "下一步："
echo ""
echo -e "  ${BOLD}1. 确保 Cola 已在运行${RESET}"
echo ""
echo -e "  ${BOLD}2. 启动桥接服务：${RESET}"
echo "     npm start"
echo ""
echo -e "  ${BOLD}3. 打开飞书，搜索你的机器人名称，开始对话！${RESET}"
echo ""
echo "  如需后台常驻运行（关掉终端也不停）："
echo "     npm install -g pm2"
echo "     pm2 start feishu-bridge.js --name feishu-bridge"
echo "     pm2 save && pm2 startup"
echo ""
echo "  文档：https://github.com/heran11011/cola-feishu-bridge"
echo ""

# Skill: Feishu Bridge Setup — 飞书桥接安装引导

## 用途 / Purpose

帮用户安装「飞书桥接服务」——一个让用户在飞书 App 里直接跟 Cola 对话的桥接程序。

This skill guides the user through installing the Feishu Bridge service, which allows them to chat with Cola directly inside the Feishu (Lark) app.

---

## 触发条件 / Triggers

用户说以下任意内容时启动本流程：
- "帮我装飞书桥接"
- "我想在飞书里跟你聊天"
- "把你接到飞书"
- "飞书机器人"
- "install feishu bridge"
- "feishu bot"
- "connect Cola to Feishu"

---

## 安装流程 / Installation Flow

按顺序执行以下步骤。每步完成后才进入下一步。

### Step 0: 检查工作目录

询问用户想把桥接服务安装在哪里，或者使用默认路径：

```
推荐安装目录：~/cola-feishu-bridge
```

如果用户没有意见，使用推荐路径。后续所有操作在该目录下进行。

### Step 1: 检查 Node.js 版本

运行：
```bash
node --version
```

- 如果版本 >= 22：继续
- 如果版本 < 22 或未安装：告知用户需要升级

  引导语：
  ```
  需要 Node.js 22 或更高版本。
  推荐用 nvm 安装：
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    nvm install 22
    nvm use 22
  或者从 https://nodejs.org 下载安装。
  ```

### Step 2: 克隆仓库

```bash
git clone https://github.com/heran11011/cola-feishu-bridge.git ~/cola-feishu-bridge
cd ~/cola-feishu-bridge
```

> 如果用户选了自定义路径，把 `~/cola-feishu-bridge` 替换掉。

### Step 3: 引导用户创建飞书应用

告知用户：

```
现在需要在飞书开放平台创建一个自建应用。请按以下步骤操作：

1. 打开 https://open.feishu.cn/app，用飞书账号登录
2. 点击「创建企业自建应用」
3. 填写应用名称（比如「Cola AI」），点击确定
4. 进入应用页面 → 左侧「凭证与基础信息」→ 复制 App ID 和 App Secret
5. 左侧「添加应用能力」→ 找到「机器人」→ 点击添加
6. 左侧「权限管理」→ 开启这 4 个权限：
   - im:message
   - im:message:send_as_bot
   - im:resource
   - im:chat
7. 左侧「事件与回调」→ ⚠️ 回调模式选「长连接」（不是 HTTP URL！）
   → 事件配置里添加：im.message.receive_v1
8. 左侧「版本管理与发布」→ 创建版本 → 申请发布

完成后，把 App ID 和 App Secret 告诉我。
```

> **关键提示**：事件回调模式必须选「长连接」，不需要公网服务器。
> 如果用户选了 HTTP URL 模式，会连不上，需要改回长连接。

等待用户提供 App ID 和 App Secret。

### Step 4: 创建 .env 文件

收到用户提供的凭证后，运行：

```bash
cd ~/cola-feishu-bridge   # 或用户自定义路径
cp .env.example .env
```

然后将凭证写入 .env：

```bash
# 用 sed 或直接写文件，替换为用户提供的实际值
cat > .env << 'EOF'
FEISHU_APP_ID=用户提供的APP_ID
FEISHU_APP_SECRET=用户提供的APP_SECRET
EOF
```

### Step 5: 安装依赖

```bash
cd ~/cola-feishu-bridge   # 或用户自定义路径
npm install
```

等待安装完成。

### Step 6: 启动桥接服务

确认 Cola 正在运行，然后：

```bash
cd ~/cola-feishu-bridge
npm start
```

成功标志：看到 `✅ 长连接已建立，等待消息中...`

如果报错 `FEISHU_APP_SECRET 未配置`：.env 文件有问题，重新检查 Step 4。

如果报错 `Cola Token: ✗ 未找到`：Cola 没有运行，先启动 Cola。

### Step 7: 在飞书里找机器人

告知用户：

```
桥接服务已启动！

现在打开飞书 App：
→ 点击搜索 → 搜索你的机器人名称（比如「Cola AI」）
→ 点击进入单聊 → 发条消息试试！

比如发「你好」或「帮我写个 Python 脚本」，Cole 会直接在飞书里回复你。
```

### Step 8（可选）: 设置后台常驻

询问用户是否需要让桥接服务在后台持续运行（关掉终端也不停）。

如果用户想要：

```bash
npm install -g pm2
pm2 start ~/cola-feishu-bridge/feishu-bridge.js --name feishu-bridge
pm2 save
pm2 startup
```

告知用户常用命令：
- `pm2 status` — 查看状态
- `pm2 logs feishu-bridge` — 查看日志
- `pm2 restart feishu-bridge` — 重启
- `pm2 stop feishu-bridge` — 停止

---

## 故障排查 / Troubleshooting

| 症状 | 原因 | 解决 |
|------|------|------|
| 飞书没有收到回复 | Cola 没运行 | 启动 Cola |
| 启动时 Secret 报错 | .env 没配置 | 检查 .env 文件 |
| 长连接断开 | 网络或飞书 API 问题 | `pm2 restart feishu-bridge` |
| 机器人在飞书找不到 | 应用未发布 | 飞书后台 → 版本管理 → 发布 |
| 收到消息但没回复 | 权限不够 | 飞书后台检查 4 个权限是否全开 |
| 图片发不出去 | im:resource 没开 | 飞书后台权限管理里开启 |

---

## 文件说明 / File Reference

- `feishu-bridge.js` — 主程序，桥接服务核心
- `.env` — 你的飞书凭证（不要上传到 Git！）
- `.env.example` — 配置模板
- `feishu-push.sh` — 主动推送脚本
- `chat_history/` — 对话历史（自动创建）
- `tmp_images/` — 图片临时目录（自动创建）

---

## 注意事项

- `.env` 文件已在 `.gitignore` 里，不会被 git 提交
- `chat_history/` 保存在本地，不会上传
- 桥接服务只处理单聊（p2p）消息，群聊消息会忽略
- 每个用户保留最近 50 条对话历史

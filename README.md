> ⚠️ **Disclaimer / 免责声明**
> 
> This is a community project, NOT officially maintained by the Cola team.
> Use at your own risk. The author is not responsible for any data loss or security issues.
> 
> 本项目为社区作品，**非 Cola 官方提供或维护**。使用风险自负，作者不对任何数据丢失或安全问题承担责任。

# Cola Feishu Bridge — 飞书桥接

> v1.1.0

[English](#english) | [中文](#中文)

---

## 中文

### 简介

让你在**飞书里直接跟 Cola 对话**——打开飞书，找到机器人，直接发消息，就像发微信一样自然。

Cola 的全部能力（写代码、查资料、分析图片、生成内容……）都可以在飞书里用。

### 跟 cola-lark-skills 的区别

| | [cola-lark-skills](https://github.com/heran11011/cola-lark-skills) | cola-feishu-bridge（本仓库） |
|--|--|--|
| **方向** | Cola → 飞书（Cola 帮你操作飞书） | 飞书 → Cola（你在飞书里跟 Cola 对话） |
| **场景** | "帮我查一下飞书群里的消息" | "我在飞书里直接问 Cola 问题" |
| **技术** | lark-cli 命令行工具 | 飞书机器人长连接服务 |
| **安装位置** | Cola 的 skills 目录 | 独立 Node.js 服务，本机后台运行 |

两者可以同时安装、互不冲突。

### 功能

- 💬 **文字对话**：直接在飞书单聊窗口跟 Cola 聊天
- 🖼️ **图片识别**：发图片给 Cola，它能看懂并回复
- 📤 **图片回复**：Cola 生成的图片会直接发回到飞书
- 🎵 **音频回复**：Cola 生成的音频（播客、TTS等）直接发回飞书
- 📎 **文件回复**：PDF 等文件自动发回飞书
- 🧠 **对话记忆**：每个用户独立的对话历史，上下文连贯
- 📡 **主动推送**：通过 `feishu-push.sh` 让 Cola 主动给你发消息

### 前置条件

- [Cola](https://cola.dev) 已安装并运行
- [Node.js](https://nodejs.org) >= 22.0.0
- 一个飞书企业自建应用（下面有详细步骤）

---

### 安装步骤

#### 第一步：克隆仓库

```bash
git clone https://github.com/heran11011/cola-feishu-bridge.git
cd cola-feishu-bridge
```

#### 第二步：在飞书后台创建应用

> 这是最关键的一步，下面每一步都有截图位置说明。

**1. 进入飞书开放平台**

打开 👉 https://open.feishu.cn/app

用你的飞书账号登录，点击「**创建企业自建应用**」。

- 应用名称：随便起，比如 `Cola AI`
- 应用描述：随便写
- 应用图标：随意

点击「确定」创建。

---

**2. 获取 App ID 和 App Secret**

进入刚创建的应用，在左侧菜单找「**凭证与基础信息**」页面。

复制并保存：
- `App ID`（格式：`cli_xxxxxxxxxxxxxxxxx`）
- `App Secret`（点击「复制」按钮）

> ⚠️ App Secret 只在这里能看到，请务必保存。

---

**3. 添加机器人能力**

左侧菜单 → 「**添加应用能力**」→ 找到「**机器人**」→ 点击「添加」。

> 这一步让你的应用可以作为机器人出现在飞书里。

---

**4. 配置权限**

左侧菜单 → 「**权限管理**」→ 搜索并开启以下权限：

| 权限标识 | 说明 |
|----------|------|
| `im:message` | 读取消息 |
| `im:message:send_as_bot` | 以机器人身份发消息 |
| `im:resource` | 读取消息中的资源（图片等） |
| `im:chat` | 读取会话信息 |

每个权限点击后选「申请」，部分权限会自动批准。

---

**5. 配置事件订阅**

左侧菜单 → 「**事件与回调**」。

> **⚠️ 关键：回调模式必须选「长连接」**
>
> 不要选「HTTP 请求 URL」，选那个你还得搭公网服务器，麻烦得很。
> 选「**长连接**」，桥接服务启动后自动连上去，不需要公网 IP，不需要 HTTPS。

在「**事件配置**」里，添加事件订阅：搜索 `im.message.receive_v1`，点击「添加」。

---

**6. 发布应用**

左侧菜单 → 「**版本管理与发布**」。

1. 点击「创建版本」
2. 版本号随意（如 `1.0.0`），可用性选「所有成员可用」
3. 点击「保存」
4. 点击「申请发布」

> 如果是个人企业版或测试企业，通常可以直接发布；正式企业需要管理员审核。
>
> 发布后等几分钟生效。

---

#### 第三步：配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的 App ID 和 App Secret：

```
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### 第四步：安装依赖

```bash
npm install
```

#### 第五步：启动桥接服务

确保 Cola 已经在运行，然后：

```bash
npm start
```

看到下面的输出说明启动成功：

```
╔══════════════════════════════════════════════════╗
║     飞书 ↔ Cola 桥接服务（长连接版 v4）           ║
╚══════════════════════════════════════════════════╝
  App ID:     cli_xxx...
  App Secret: ✓ 已配置
  Cola Token: ✓ 已配置
  ...
✅ 长连接已建立，等待消息中...
```

#### 第六步：在飞书里找到机器人

打开飞书 → 搜索你创建的应用名称（如 `Cola AI`）→ 点击进入单聊 → 发条消息试试！

---

### 可选：后台常驻运行

如果你想让桥接服务在后台自动运行，推荐用 PM2：

```bash
npm install -g pm2
pm2 start feishu-bridge.js --name feishu-bridge
pm2 save
pm2 startup   # 设置开机自启
```

常用命令：
```bash
pm2 status          # 查看状态
pm2 logs feishu-bridge  # 查看日志
pm2 restart feishu-bridge
pm2 stop feishu-bridge
```

---

### 主动推送

你可以通过脚本让 Cola 主动发消息给你：

```bash
# 给自己发消息
./feishu-push.sh "服务器异常告警：CPU 使用率 95%"

# 给指定 open_id 发消息
./feishu-push.sh "消息内容" "ou_xxxxxxxxxxxxxxx"
```

> 获取自己的 open_id：在飞书里跟机器人发消息，服务端日志会打出发送者的 open_id。

---

### ⚠️ 安全注意事项

本项目是**本地桥接服务**，连接你的飞书和本地 Cola。在使用前请了解以下潜在风险：

**🔒 凭证安全**
- `.env` 文件包含你的飞书 App Secret，**绝对不要提交到 git 或分享给任何人**
- 项目已配置 `.gitignore` 保护 `.env`，但请自行确认生效
- 建议将 `.env` 文件权限设置为 `chmod 600 .env`（仅本人可读）

**👤 访问控制**
- 默认情况下，**任何能找到你飞书机器人的用户都可以通过它触发 Cola**
- 强烈建议在 `.env` 中配置用户白名单：
  ```
  ALLOWED_OPEN_IDS=ou_你的openid,ou_其他信任用户的openid
  ```
- 不在白名单中的用户发消息会被拒绝
- 如果不配置，所有用户均可使用（不推荐在公开环境中这样做）
- 获取 open_id：给机器人发条消息，服务日志中会打印发送者的 open_id

**💻 本地权限**
- Cola 拥有操作本地文件系统、执行代码等能力。通过飞书触发 Cola 等同于授予远程操作权限
- 请确保只有你信任的人能与机器人对话（见上方白名单配置）

**📁 文件安全**
- 桥接服务只允许读取 Cola 输出目录和临时图片目录内的文件
- `chat_history/` 目录保存对话历史，包含你与 Cola 的所有对话内容，请注意保护

**🔄 依赖安全**
- 请定期运行 `npm audit` 检查依赖漏洞
- 运行 `npm audit fix` 可自动修复已知漏洞

**🌐 网络**
- 桥接服务通过飞书 SDK 的长连接与飞书服务器通信，不需要公网 IP
- Cola 的 WebSocket 连接仅限本地 `127.0.0.1`，不暴露到外网

---

### 反馈与问题

遇到问题？欢迎提 issue：
👉 https://github.com/heran11011/cola-feishu-bridge/issues/new

提交时请附上：
- 错误日志（终端输出）
- Node.js 版本（`node -v`）
- 操作系统
- 飞书后台配置截图（可选）

---

## English

### Introduction

Chat with Cola directly inside **Feishu (Lark)** — find the bot, send a message, done. No browser needed.

All of Cola's capabilities (coding, research, image analysis, content generation...) become available right inside Feishu.

### Difference from cola-lark-skills

| | [cola-lark-skills](https://github.com/heran11011/cola-lark-skills) | cola-feishu-bridge (this repo) |
|--|--|--|
| **Direction** | Cola → Feishu (Cola operates Feishu for you) | Feishu → Cola (you chat with Cola inside Feishu) |
| **Use case** | "Check messages in my Feishu group" | "Ask Cola questions directly from Feishu" |
| **Tech** | lark-cli command-line tool | Feishu bot with persistent WebSocket connection |
| **Deployment** | Installed as Cola skills | Standalone Node.js service, runs locally |

Both can be installed simultaneously without conflict.

### Features

- 💬 **Text chat**: Talk to Cola in Feishu DMs
- 🖼️ **Image understanding**: Send images, Cola can see and respond
- 📤 **Image replies**: Cola's generated images are sent back to Feishu
- 🎵 **Audio replies**: Cola's generated audio (podcasts, TTS, etc.) sent back to Feishu
- 📎 **File replies**: PDFs and other files automatically sent back to Feishu
- 🧠 **Conversation memory**: Per-user chat history with persistent context
- 📡 **Push messages**: Proactively send messages to yourself via `feishu-push.sh`

### Prerequisites

- [Cola](https://cola.dev) installed and running
- [Node.js](https://nodejs.org) >= 22.0.0
- A Feishu self-built enterprise app (detailed steps below)

---

### Setup Guide

#### Step 1: Clone the repo

```bash
git clone https://github.com/heran11011/cola-feishu-bridge.git
cd cola-feishu-bridge
```

#### Step 2: Create a Feishu App

**1. Open Feishu Open Platform**

Go to 👉 https://open.feishu.cn/app

Log in and click **"Create self-built app"**.

- App name: anything, e.g. `Cola AI`
- Description: anything
- Icon: optional

Click "Confirm".

---

**2. Get App ID and App Secret**

In your app, go to **"Credentials & Basic Info"** in the left menu.

Copy and save:
- `App ID` (format: `cli_xxxxxxxxxxxxxxxxx`)
- `App Secret` (click the Copy button)

> ⚠️ App Secret is only visible here. Save it now.

---

**3. Enable Bot capability**

Left menu → **"Add features"** → Find **"Bot"** → Click "Add".

---

**4. Configure permissions**

Left menu → **"Permission management"** → Search and enable:

| Permission | Description |
|------------|-------------|
| `im:message` | Read messages |
| `im:message:send_as_bot` | Send messages as bot |
| `im:resource` | Access message resources (images, etc.) |
| `im:chat` | Read conversation info |

---

**5. Configure event subscription**

Left menu → **"Events & Callbacks"**.

> **⚠️ CRITICAL: Choose "Persistent Connection" mode**
>
> Do NOT choose "HTTP Request URL" — that requires a public server with HTTPS.
> Choose **"Persistent Connection"** — the bridge service connects automatically. No public IP needed.

Under "Event Configuration", add event: search `im.message.receive_v1` and click "Subscribe".

---

**6. Publish the app**

Left menu → **"Version management"**.

1. Click "Create version"
2. Set version number (e.g. `1.0.0`), availability: "All members"
3. Save
4. Click "Apply for release"

> Personal/test tenants can usually publish immediately. Enterprise tenants may need admin approval.

---

#### Step 3: Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Step 4: Install dependencies

```bash
npm install
```

#### Step 5: Start the bridge

Make sure Cola is running first, then:

```bash
npm start
```

You should see:
```
✅ 长连接已建立，等待消息中...
```

#### Step 6: Find your bot in Feishu

Open Feishu → Search your app name (e.g. `Cola AI`) → Start a DM → Send a message!

---

### Optional: Run in background

Use PM2 to keep the bridge running persistently:

```bash
npm install -g pm2
pm2 start feishu-bridge.js --name feishu-bridge
pm2 save
pm2 startup
```

---

### Push messages

Proactively send messages to yourself:

```bash
./feishu-push.sh "Alert: server CPU at 95%"
./feishu-push.sh "message content" "ou_xxxxxxxxxxxxxxx"
```

---

### ⚠️ Security Notes

This is a **local bridge service** connecting your Feishu and local Cola. Please understand the following risks before use:

**🔒 Credentials**
- `.env` contains your Feishu App Secret — **never commit it to git or share it**
- `.gitignore` is configured to protect `.env`, but please verify it works
- Recommended: `chmod 600 .env` (owner read-only)

**👤 Access Control**
- By default, **anyone who can find your Feishu bot can trigger your local Cola**
- Strongly recommend configuring a user whitelist in `.env`:
  ```
  ALLOWED_OPEN_IDS=ou_your_openid,ou_another_trusted_user
  ```
- Users not on the whitelist will be rejected
- Without a whitelist, all users can interact (not recommended in shared environments)
- To find your open_id: send a message to the bot and check the server logs

**💻 Local Permissions**
- Cola can read/write local files and execute code. Triggering Cola via Feishu is equivalent to granting remote access
- Ensure only trusted users can chat with the bot (see whitelist above)

**📁 File Safety**
- The bridge only allows reading files from Cola's output directory and temp image directory
- `chat_history/` contains all your conversation data — keep it protected

**🔄 Dependencies**
- Run `npm audit` regularly to check for known vulnerabilities
- Run `npm audit fix` to auto-fix

**🌐 Network**
- The bridge communicates with Feishu via SDK persistent connection — no public IP needed
- Cola's WebSocket is local-only (`127.0.0.1`), not exposed to the internet

---

### Feedback & Issues

Run into problems? Open an issue:
👉 https://github.com/heran11011/cola-feishu-bridge/issues/new

Please include:
- Error logs (terminal output)
- Node.js version (`node -v`)
- OS
- Feishu admin console screenshots (optional)

---

### 相关项目 / Related Projects

| 项目 | 说明 |
|------|------|
| [cola-lark-skills](https://github.com/heran11011/cola-lark-skills) | Cola 连接飞书，帮你操作飞书（Cola → 飞书） |
| [cola-feishu-bridge](https://github.com/heran11011/cola-feishu-bridge)（本仓库） | 在飞书中直接跟 Cola 对话（飞书 → Cola） |
| [cola-dingtalk-skills](https://github.com/heran11011/cola-dingtalk-skills) | Cola 连接钉钉，帮你操作钉钉（Cola → 钉钉） |

---

## License

MIT

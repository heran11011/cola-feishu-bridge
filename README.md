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

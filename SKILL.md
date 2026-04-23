# Skill: Feishu Bridge Setup — 飞书桥接安装引导

## 用途 / Purpose

帮用户安装「飞书桥接服务」——一个让用户在飞书 App 里直接跟 Cola 对话的桥接程序。Cola 的回复（文字、图片、音频、PDF 等文件）都会自动发回飞书。

This skill guides the user through installing the Feishu Bridge service, which allows them to chat with Cola directly inside the Feishu (Lark) app. Cola's responses (text, images, audio, PDFs, and other files) are automatically sent back to Feishu.

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

## 与 cola-lark-skills 的关系（核心！Cola 必须理解这个）

这两个 skill 是互补的，**强烈推荐一起安装**：

| | cola-lark-skills | cola-feishu-bridge（本 skill） |
|--|--|--|
| **方向** | Cola → 飞书（Cola 帮你操作飞书） | 飞书 → Cola（你在飞书里跟 Cola 对话） |
| **场景** | 在 Cola 桌面端说"帮我查飞书群消息" | 打开飞书直接跟 Cola 聊天 |

**两个 skill 共用同一个飞书应用**。cola-lark-skills 安装时会自动创建飞书应用，并且配好了：
- ✅ App ID / App Secret
- ✅ 机器人能力
- ✅ 事件订阅
- ✅ im:message 等大量权限

这意味着装了 lark-skills 之后，bridge 这边几乎不需要额外的飞书后台配置，只需要确认「长连接」模式就行。

**装完两个之后的最终效果**：用户在飞书里跟 Cola 说"帮我查一下飞书群里的消息"，Cola 就能直接去飞书查——整个链路在飞书内闭环，不用切 App。

---

## 安装流程 / Installation Flow

按顺序执行以下步骤。每步完成后才进入下一步。

### Step 1: 检测是否已有飞书应用（关键！）

运行：
```bash
lark-cli config show 2>/dev/null
```

**情况 A：已装 cola-lark-skills（lark-cli 有输出）** → 快速路径 🚀

如果输出了 `appId` 和 `appSecret`，说明用户已经通过 cola-lark-skills 创建过飞书应用。

告知用户：
```
检测到你已经装了飞书连接（cola-lark-skills），你的飞书应用可以直接复用！
应用、机器人、权限、事件订阅都已经配好了，不需要重新创建。

只需要确认一下飞书后台的事件接收模式是「长连接」就行，然后直接启动。
```

直接用 lark-cli 输出的 appId 和 appSecret，**跳到 Step 3**。

**情况 B：未装 cola-lark-skills（lark-cli 不存在或无输出）** → 强烈推荐先装

**不要直接走手动创建流程！** 先告知用户不装 lark-skills 的代价：

```
检测到你还没有装飞书连接技能包（cola-lark-skills）。

强烈推荐你先装一下，原因：

1. 它会自动帮你创建飞书应用、配好权限和机器人，省掉很多手动配置
2. 装了之后你在飞书里跟我对话时，我还能帮你：
   - 💬 读群消息、做摘要（"看看群里有什么重要消息"）
   - 📅 查日程、建会议（"明天有什么会"）
   - ✅ 管任务、建待办（"我有什么任务"）
   - 📄 搜文档、读文档（"帮我搜一下周报"）
   - 📊 查多维表格（"查一下表格里的数据"）
3. 不装的话，你只能在飞书里跟我聊天，但我没法帮你操作飞书上的任何东西——相当于只有嘴没有手

要不要先装？跟我说"帮我连接飞书"就行，一分钟搞定。
```

- 如果用户同意（推荐）：引导安装 cola-lark-skills，装完回来从情况 A 继续
- 如果用户执意不装：进入 **Step 2**，手动创建应用

### Step 2: 手动创建飞书应用（仅在没有 lark-cli 且用户不想装时）

> ⚠️ 只有 Step 1 情况 B 且用户明确拒绝装 cola-lark-skills 时才走这步。

告知用户：
```
好，那手动配置，步骤会多一些：

1. 打开 https://open.feishu.cn/app，用飞书账号登录
2. 点击「创建企业自建应用」
3. 填写应用名称（比如「Cola AI」），点击确定
4. 进入应用页面，需要配置以下内容：

📌 应用能力 → 添加「机器人」

📌 权限管理 → 开通这 4 个权限：
   - im:message（接收消息）
   - im:message:send_as_bot（机器人发消息）
   - im:resource（图片资源）
   - im:chat（会话信息）

📌 事件与回调 →
   - 连接方式选「长连接」（Persistent Connection），不要选 HTTP！
   - 添加事件：im.message.receive_v1

📌 版本管理与发布 → 创建版本 → 申请发布

配置完成后，把「凭证与基础信息」页面里的 App ID 和 App Secret 发给我。
```

### Step 3: 确认飞书后台长连接模式

**如果从 Step 1 情况 A 来**（已有 lark-skills）：

lark-cli 创建的应用已经有机器人能力、权限和事件订阅了。唯一需要确认的是事件接收模式：

```
你的飞书应用配置基本都有了。请确认一下事件接收模式：

打开飞书后台 → 你的应用 → 左侧「事件与回调」
→ 确认连接方式是「长连接」（Persistent Connection）

如果显示的是「长连接」→ 告诉我，直接下一步
如果显示的是「HTTP URL」→ 改成「长连接」，保存

（链接：https://open.feishu.cn/app/你的AppID/event）
```

> 注意：如果用户告诉你事件订阅（im.message.receive_v1）也已经有了，那就一步都不用配，直接跳到 Step 4。

**如果从 Step 2 来**：用户已经在 Step 2 中配好了，等凭证就行。

### Step 4: 检查 Node.js 版本

运行：
```bash
node --version
```

- 如果版本 >= 22：继续
- 如果版本 < 22 或未安装：

  ```
  需要 Node.js 22 或更高版本。
  推荐用 nvm 安装：
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    nvm install 22
    nvm use 22
  或者从 https://nodejs.org 下载安装。
  ```

### Step 5: 克隆仓库 + 安装依赖

```bash
git clone https://github.com/heran11011/cola-feishu-bridge.git ~/cola-feishu-bridge
cd ~/cola-feishu-bridge
npm install
```

> 如果用户选了自定义路径，替换 `~/cola-feishu-bridge`。

### Step 6: 创建 .env 文件

```bash
cd ~/cola-feishu-bridge
cat > .env << 'EOF'
FEISHU_APP_ID=实际的APP_ID
FEISHU_APP_SECRET=实际的APP_SECRET
EOF
```

- 情况 A（lark-cli 复用）：直接用 `lark-cli config show` 输出的 appId 和 appSecret 写入，**不需要问用户要**
- 情况 B（手动创建）：用 Step 2 中用户提供的凭证

### Step 7: 启动桥接服务

确认 Cola 正在运行，然后：

```bash
cd ~/cola-feishu-bridge
npm start
```

成功标志：看到 `✅ 长连接已建立，等待消息中...`

常见报错：
- `FEISHU_APP_SECRET 未配置` → .env 文件有问题，检查 Step 6
- `Cola Token: ✗ 未找到` → Cola 没运行，先启动 Cola

### Step 8: 在飞书里找机器人

告知用户：
```
✅ 桥接服务已启动，长连接已建立。

现在打开飞书 → 搜索你的机器人名称 → 进入单聊 → 发条消息试试！

⚠️ 提醒：
- 关掉终端服务就停了，想长期跑可以用 PM2 托管（下一步）
- 只支持私聊，群聊消息会被忽略

去飞书试试？
```

### Step 9（可选）: 后台常驻

询问用户是否需要让桥接服务在后台持续运行。

如果用户想要：
```bash
npm install -g pm2
pm2 start ~/cola-feishu-bridge/feishu-bridge.js --name feishu-bridge
pm2 save
pm2 startup
```

### Step 10（可选）: 推荐互补 skill

**仅在用户从 Step 2 来（没装 cola-lark-skills）时**，安装完成后再次推荐：
```
飞书桥接装好了！现在你可以在飞书里跟我对话了。

不过现在你只能跟我聊天，我没法帮你操作飞书上的东西。
装一下 cola-lark-skills 之后，你在飞书里跟我说"帮我查一下群消息"，我就能直接帮你查——整个链路在飞书内闭环。

要装吗？跟我说"帮我连接飞书"就行。
```

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
| 事件回调连不上 | 选了 HTTP 模式 | 飞书后台事件与回调 → 改为长连接 |
| 图片/音频没发到飞书 | im:resource 权限未开或 Cola 没在运行 | 飞书后台权限管理确认 `im:resource` 已开启 + 确认 Cola 正在运行 |

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

---

## 故障排查与反馈

在安装或使用过程中遇到问题时：

1. 先尝试根据错误信息自行排查（检查 `.env` 配置、Node 版本、飞书后台权限和事件回调设置）
2. 如果你无法自动修复，帮用户提交 issue 反馈：

### 提交 issue 流程（优先自动提交）

**Step 1: 检查 gh CLI 登录态**

```bash
gh auth status
```

**Step 2a: 如果已登录 GitHub → 直接帮用户提 issue**

整理好以下信息，展示给用户确认：
- 标题：简明描述问题
- 内容：错误日志、Node.js 版本（`node -v`）、操作系统、问题复现步骤

用户确认后，执行：

```bash
gh issue create --repo heran11011/cola-feishu-bridge \
  --title "问题标题" \
  --body "整理好的问题描述"
```

告诉用户：
> ✅ 已帮你提交 issue，开发者会收到通知并尽快处理。

**Step 2b: 如果未登录 GitHub → 给链接**

告诉用户：
> 你的电脑还没有登录 GitHub CLI，我没办法直接帮你提交。
> 你可以手动在这里提 issue：
> https://github.com/heran11011/cola-feishu-bridge/issues/new
>
> 或者先登录 GitHub CLI（`gh auth login`），下次我就能直接帮你提交了。

提交 issue 时，引导用户附上：
- 错误日志（终端输出）
- Node.js 版本（`node -v`）
- 操作系统
- 飞书后台配置截图（可选）

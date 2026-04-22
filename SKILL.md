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

## 与 cola-lark-skills 的关系

这两个 skill 是互补的：

| | cola-lark-skills | cola-feishu-bridge（本 skill） |
|--|--|--|
| **方向** | Cola → 飞书（Cola 帮你操作飞书） | 飞书 → Cola（你在飞书里跟 Cola 对话） |
| **场景** | 在 Cola 桌面端说"帮我查飞书群消息" | 打开飞书直接跟 Cola 聊天 |

**两个 skill 共用同一个飞书应用**。如果用户已经装了 cola-lark-skills，那个应用的 App ID / App Secret / 大部分权限都可以直接复用，不需要重新创建。

装完两个之后的效果：用户在飞书里跟 Cola 说"帮我查一下飞书群里的消息"，Cola 就能直接去飞书搜——整个链路在飞书内完成。

---

## 安装流程 / Installation Flow

按顺序执行以下步骤。每步完成后才进入下一步。

### Step 1: 检测是否已有飞书应用（关键！）

运行：
```bash
lark-cli config show 2>/dev/null
```

**情况 A：已装 cola-lark-skills（lark-cli 有输出）**

如果输出了 `appId` 和 `appSecret`，说明用户已经通过 cola-lark-skills 创建过飞书应用。

告知用户：
```
检测到你已经装了飞书连接（cola-lark-skills），你的飞书应用可以直接复用，不需要重新创建！

接下来只需要在飞书后台给这个应用加几个配置就行。
```

直接用 lark-cli 输出的 appId 和 appSecret，**跳到 Step 3**。

**情况 B：未装 cola-lark-skills（lark-cli 不存在或无输出）**

推荐用户先装 cola-lark-skills：
```
推荐你先装一下飞书连接技能包（cola-lark-skills），它会帮你自动创建飞书应用和配置权限。
装完之后这边的飞书桥接就可以直接复用那个应用，省很多步骤。

要不要先装那个？
```

- 如果用户同意：引导安装 cola-lark-skills（告诉 Cola 说"帮我连接飞书"），装完回来从情况 A 继续
- 如果用户不想装 cola-lark-skills：进入 **Step 2**，手动创建应用

### Step 2: 手动创建飞书应用（仅在没有 lark-cli 时）

> 只有 Step 1 情况 B 且用户不想装 cola-lark-skills 时才走这步。

告知用户：
```
需要在飞书开放平台创建一个自建应用：

1. 打开 https://open.feishu.cn/app，用飞书账号登录
2. 点击「创建企业自建应用」
3. 填写应用名称（比如「Cola AI」），点击确定
4. 进入应用页面 → 左侧「凭证与基础信息」→ 记下 App ID 和 App Secret（先别急着给我，后面配置完再一起给）
```

### Step 3: 在飞书后台配置应用

不管是复用还是新建的应用，都需要做以下配置。

告知用户打开飞书后台的应用配置页面：
- 如果从 Step 1 情况 A 来：`https://open.feishu.cn/app/（lark-cli 输出的 appId）`
- 如果从 Step 2 来：用户刚创建的应用页面

**逐项检查和配置：**

```
请在飞书后台做以下配置（有些可能已经配好了，确认一下就行）：

1️⃣ 添加机器人能力
   左侧「应用能力」→ 添加「机器人」
   （如果已经有了就跳过）

2️⃣ 权限管理
   左侧「权限管理」→ 确认以下权限已开启：
   - im:message（接收消息）
   - im:message:send_as_bot（机器人发消息）
   - im:resource（图片资源）
   - im:chat（会话信息）
   （如果之前装了 cola-lark-skills，im:message 和 im:chat 应该已经有了，只需要补 im:message:send_as_bot 和 im:resource）

3️⃣ 事件与回调（⚠️ 最关键的一步）
   左侧「事件与回调」→ 
   
   📌 连接方式：必须选「长连接」（Persistent Connection），不要选 HTTP！
   
   📌 添加事件：im.message.receive_v1（接收消息）
   （如果列表里已经有了就不用重复添加）

4️⃣ 版本管理与发布
   左侧「版本管理与发布」→ 创建版本 → 申请发布
   （因为加了新的能力和权限，需要重新发版）

配置完了告诉我，然后把 App ID 和 App Secret 发给我。
```

> **重要**：如果用户是从 lark-cli 复用的，App ID 和 App Secret 已经有了（从 `lark-cli config show` 读到的），不需要再问用户要。直接跳到 Step 5。

### Step 4: 获取凭证

- 如果从 Step 1 情况 A 来：凭证已经从 lark-cli 读到了，**跳到 Step 5**
- 如果从 Step 2/3 来：等待用户提供 App ID 和 App Secret

### Step 5: 检查 Node.js 版本

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

### Step 6: 克隆仓库 + 安装依赖

```bash
git clone https://github.com/heran11011/cola-feishu-bridge.git ~/cola-feishu-bridge
cd ~/cola-feishu-bridge
npm install
```

> 如果用户选了自定义路径，替换 `~/cola-feishu-bridge`。

### Step 7: 创建 .env 文件

```bash
cd ~/cola-feishu-bridge
cat > .env << 'EOF'
FEISHU_APP_ID=实际的APP_ID
FEISHU_APP_SECRET=实际的APP_SECRET
EOF
```

用 Step 1 从 lark-cli 读到的凭证，或 Step 4 用户提供的凭证。

### Step 8: 启动桥接服务

确认 Cola 正在运行，然后：

```bash
cd ~/cola-feishu-bridge
npm start
```

成功标志：看到 `✅ 长连接已建立，等待消息中...`

常见报错：
- `FEISHU_APP_SECRET 未配置` → .env 文件有问题，检查 Step 7
- `Cola Token: ✗ 未找到` → Cola 没运行，先启动 Cola

### Step 9: 在飞书里找机器人

告知用户：
```
✅ 桥接服务已启动，长连接已建立。

现在你可以去飞书里找到你刚创建的那个机器人（Cola AI），直接给它发消息试试——它会把你的消息转给 Cola，然后把 Cola 的回复发回给你。

⚠️ 提醒一下：
- 这个服务现在是后台运行的，关掉终端就停了。如果想长期跑，后面可以用 PM2 托管
- 只支持私聊（直接给机器人发消息），群聊里的消息会被忽略

去飞书试试？
```

### Step 10（可选）: 后台常驻

询问用户是否需要让桥接服务在后台持续运行。

如果用户想要：
```bash
npm install -g pm2
pm2 start ~/cola-feishu-bridge/feishu-bridge.js --name feishu-bridge
pm2 save
pm2 startup
```

### Step 11（可选）: 推荐互补 skill

如果用户是从 Step 2 来的（没装 cola-lark-skills），安装完成后推荐：
```
飞书桥接装好了！现在你可以在飞书里跟我对话了。

顺便推荐一下：还有一个互补的技能包 cola-lark-skills，装了之后你在飞书里跟我说"帮我查一下群消息"或者"今天有什么会"，我就能直接帮你操作飞书——整个链路在飞书内完成，不用切回桌面端。

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

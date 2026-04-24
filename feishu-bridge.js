#!/usr/bin/env node
/**
 * feishu-bridge.js (长连接版 v4)
 * 飞书机器人 ↔ Cola AI 桥接服务
 *
 * 功能：文本消息 + 图片识别 + 富文本回复 + lark-cli 凭证复用 + 权限检测 + 首次欢迎 + Issue 引导
 * 启动: node feishu-bridge.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');
const Lark = require('@larksuiteoapi/node-sdk');

// ─── lark-cli 凭证检测 ────────────────────────────────────────────────────────

/**
 * 尝试从 lark-cli config show --json 读取 appId / appSecret
 * 返回 { appId, appSecret } 或 null
 */
function tryLoadLarkCliConfig() {
  try {
    const stdout = execSync('lark-cli config show --json', {
      timeout: 5000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (!stdout || !stdout.trim()) return null;
    const cfg = JSON.parse(stdout.trim());
    const appId = cfg.appId || cfg.app_id || cfg.AppId;
    const appSecret = cfg.appSecret || cfg.app_secret || cfg.AppSecret;
    if (appId && appSecret) return { appId, appSecret };
    return null;
  } catch {
    return null;
  }
}

/**
 * 尝试从 lark-cli auth status --json 读取已授权的 scope 列表
 * 返回 string[] 或 null
 */
function tryLoadLarkCliScopes() {
  try {
    const stdout = execSync('lark-cli auth status --json', {
      timeout: 5000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (!stdout || !stdout.trim()) return null;
    const status = JSON.parse(stdout.trim());
    // 可能是 { scopes: [...] } 或 { scope: "..." } 或数组
    if (Array.isArray(status)) return status;
    if (Array.isArray(status.scopes)) return status.scopes;
    if (typeof status.scope === 'string') return status.scope.split(/[\s,]+/).filter(Boolean);
    return null;
  } catch {
    return null;
  }
}

/**
 * 尝试获取 lark-cli 版本号
 * 返回 "v1.0.5" 形式字符串或 null
 */
function tryGetLarkCliVersion() {
  try {
    const stdout = execSync('lark-cli --version', {
      timeout: 5000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (!stdout) return null;
    // 匹配类似 "1.0.5" 或 "v1.0.5" 的版本号
    const m = stdout.match(/v?(\d+\.\d+[\.\d]*)/);
    return m ? `v${m[1]}` : stdout.trim().slice(0, 20);
  } catch {
    return null;
  }
}

// 桥接服务需要的权限列表
const REQUIRED_SCOPES = [
  'im:message',
  'im:message:send_as_bot',
  'im:resource',
  'im:chat',
];

// ─── Config ──────────────────────────────────────────────────────────────────

function loadEnv() {
  const envFile = path.join(__dirname, '.env');
  if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadEnv();

// 优先尝试 lark-cli 凭证，fallback 到 .env
const larkCliConfig = tryLoadLarkCliConfig();
const CRED_SOURCE = larkCliConfig ? 'lark-cli 复用' : '.env 文件';

const FEISHU_APP_ID =
  (larkCliConfig && larkCliConfig.appId) ||
  process.env.FEISHU_APP_ID ||
  '';

if (!FEISHU_APP_ID) {
  console.error('❌ FEISHU_APP_ID 未配置！请在 .env 文件中设置，或先配置 lark-cli（运行 lark-cli config set）。');
  process.exit(1);
}

const FEISHU_APP_SECRET =
  (larkCliConfig && larkCliConfig.appSecret) ||
  process.env.FEISHU_APP_SECRET ||
  '';

const COLA_PORT = parseInt(process.env.COLA_PORT || '19532', 10);
const COLA_GATEWAY_TOKEN = process.env.COLA_GATEWAY_TOKEN ||
  (() => {
    const tokenPath = path.join(os.homedir(), '.cola', 'gateway-token');
    return fs.existsSync(tokenPath) ? fs.readFileSync(tokenPath, 'utf8').trim() : '';
  })();

// 用户白名单
const ALLOWED_OPEN_IDS = (process.env.ALLOWED_OPEN_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// lark-cli 版本和权限（启动时检测一次）
const LARK_CLI_VERSION = tryGetLarkCliVersion();
const LARK_CLI_SCOPES = tryLoadLarkCliScopes();

if (!FEISHU_APP_SECRET) {
  console.error('❌ FEISHU_APP_SECRET 未配置！请在 .env 文件中设置，或先配置 lark-cli（运行 lark-cli config set）。');
  process.exit(1);
}

// 图片临时目录
const IMG_TMP_DIR = path.join(__dirname, 'tmp_images');
if (!fs.existsSync(IMG_TMP_DIR)) fs.mkdirSync(IMG_TMP_DIR, { recursive: true });

// 对话历史目录（持久化）
const HISTORY_DIR = path.join(__dirname, 'chat_history');
if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });

// ─── Chat History (持久化上下文) ──────────────────────────────────────────────

const MAX_HISTORY_PER_USER = 50; // 每用户保留最近50条

function getHistoryPath(senderId) {
  if (!/^ou_[a-f0-9]+$/.test(senderId)) {
    throw new Error(`Invalid senderId format: ${senderId}`);
  }
  return path.join(HISTORY_DIR, `${senderId}.json`);
}

function loadHistory(senderId) {
  const p = getHistoryPath(senderId);
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return [];
  }
}

function saveHistory(senderId, history) {
  // 只保留最近 N 条
  const trimmed = history.slice(-MAX_HISTORY_PER_USER);
  fs.writeFileSync(getHistoryPath(senderId), JSON.stringify(trimmed, null, 2));
}

function appendToHistory(senderId, role, content) {
  const history = loadHistory(senderId);
  history.push({
    role,
    content,
    timestamp: new Date().toISOString(),
  });
  saveHistory(senderId, history);
}

/**
 * 检查是否是用户的第一次对话（历史记录为空）
 * 用于决定是否追加首次联动提示
 */
function isFirstConversation(senderId) {
  const history = loadHistory(senderId);
  // 只统计 user 角色的条目
  const userMessages = history.filter(h => h.role === 'user');
  return userMessages.length === 0;
}

// ─── Welcome Users (首次欢迎) ─────────────────────────────────────────────────

const WELCOMED_USERS_PATH = path.join(__dirname, 'welcomed-users.json');

function loadWelcomedUsers() {
  try {
    if (fs.existsSync(WELCOMED_USERS_PATH)) {
      return JSON.parse(fs.readFileSync(WELCOMED_USERS_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('[welcome] Failed to load welcomed-users.json:', err.message);
  }
  return {};
}

function saveWelcomedUsers(data) {
  try {
    fs.writeFileSync(WELCOMED_USERS_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[welcome] Failed to save welcomed-users.json:', err.message);
  }
}

function isFirstWelcome(openId) {
  const users = loadWelcomedUsers();
  return !users[openId];
}

function markWelcomed(openId) {
  const users = loadWelcomedUsers();
  users[openId] = { welcomedAt: new Date().toISOString() };
  saveWelcomedUsers(users);
}

const WELCOME_MESSAGE = `👋 连接成功！我是你的 Cola 助手。

你可以直接在这里跟我聊天，我能帮你：
• 搜文档、查日程、管任务
• 读群消息摘要
• 任何你跟 Cola 聊的事

有问题随时找我～`;

// ─── Issue 引导 (错误回复追加提示) ────────────────────────────────────────────

const ERROR_KEYWORDS = ['报错', '失败', '不支持', '暂不支持', '无法', '出错', 'error', 'failed', 'not supported', 'unsupported', 'unable'];
const ISSUE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 小时
const ISSUE_COOLDOWN_PATH = path.join(__dirname, 'issue-cooldown.json');

function loadIssueCooldown() {
  try {
    if (fs.existsSync(ISSUE_COOLDOWN_PATH)) {
      return JSON.parse(fs.readFileSync(ISSUE_COOLDOWN_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('[issue] Failed to load issue-cooldown.json:', err.message);
  }
  return {};
}

function saveIssueCooldown(data) {
  try {
    fs.writeFileSync(ISSUE_COOLDOWN_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[issue] Failed to save issue-cooldown.json:', err.message);
  }
}

/**
 * 检查回复文本是否包含错误关键词，且该用户未在冷却期内
 * 返回 true 表示应该追加 issue 引导
 */
function shouldSendIssueHint(openId, replyText) {
  if (!replyText) return false;
  const lower = replyText.toLowerCase();
  const hasError = ERROR_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
  if (!hasError) return false;

  const cooldown = loadIssueCooldown();
  const lastSent = cooldown[openId];
  if (lastSent && (Date.now() - new Date(lastSent).getTime()) < ISSUE_COOLDOWN_MS) {
    return false;
  }
  return true;
}

function markIssueSent(openId) {
  const cooldown = loadIssueCooldown();
  cooldown[openId] = new Date().toISOString();
  saveIssueCooldown(cooldown);
}

const ISSUE_HINT_MESSAGE = `💡 如果这个功能对你很重要，要不要帮你给这个 Skill 的作者提个 issue？期待他的更新 👉 https://github.com/heran11011/cola-feishu-bridge/issues/new`;

// ─── Dedup cache ─────────────────────────────────────────────────────────────

const processedMsgIds = new Set();
const MAX_DEDUP_SIZE = 500;

function isNewMessage(msgId) {
  if (!msgId) return true;
  if (processedMsgIds.has(msgId)) return false;
  processedMsgIds.add(msgId);
  if (processedMsgIds.size > MAX_DEDUP_SIZE) {
    const first = processedMsgIds.values().next().value;
    processedMsgIds.delete(first);
  }
  return true;
}

// ─── Cola WebSocket ───────────────────────────────────────────────────────────

// 扫描 outputs 目录中在指定时间之后创建的图片/音频文件
const OUTPUTS_DIR = path.join(os.homedir(), '.cola', 'outputs');

// 文件路径安全校验：只允许 OUTPUTS_DIR 或 IMG_TMP_DIR 下的文件
function isAllowedFilePath(filePath) {
  const resolved = path.resolve(filePath);
  return resolved.startsWith(OUTPUTS_DIR + path.sep) || resolved.startsWith(IMG_TMP_DIR + path.sep)
    || resolved === OUTPUTS_DIR || resolved === IMG_TMP_DIR;
}
const MEDIA_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp3', '.wav', '.ogg', '.m4a', '.mp4', '.pdf']);

function scanNewMediaFiles(sinceMs) {
  const results = [];
  try {
    const entries = fs.readdirSync(OUTPUTS_DIR);
    for (const entry of entries) {
      const fullPath = path.join(OUTPUTS_DIR, entry);
      const ext = path.extname(entry).toLowerCase();
      if (!MEDIA_EXTENSIONS.has(ext)) continue;
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile() && stat.mtimeMs >= sinceMs) {
          results.push(fullPath);
        }
      } catch {}
    }
  } catch {}
  return results;
}

function callColaAgent(userMessage, sessionKey, attachments) {
  const beforeCallMs = Date.now();
  return new Promise((resolve, reject) => {
    if (!COLA_GATEWAY_TOKEN) {
      return resolve({ text: `[Echo] ${userMessage}`, files: [] });
    }

    const url = `ws://127.0.0.1:${COLA_PORT}?token=${COLA_GATEWAY_TOKEN}`;
    const ws = new WebSocket(url);
    const reqId = `feishu-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let timeout;
    const collectedFiles = []; // 收集中间事件里的文件路径

    ws.addEventListener('open', () => {
      const params = {
        message: userMessage,
        sessionKey,
        channel: 'Feishu',
      };
      if (attachments && attachments.length > 0) {
        params.attachments = attachments.map(a => a.path);
      }
      ws.send(JSON.stringify({
        type: 'request',
        id: reqId,
        method: 'agent.prompt',
        params,
      }));
    });

    ws.addEventListener('message', (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }

      // 调试：记录 RPC response
      if (data.type === 'response') {
        console.log(`[ws:response] id=${data.id} ok=${data.ok} error=${data.error || ''} keys=${Object.keys(data.data || data.result || {}).join(',')}`);
      }

      // 调试：记录非 log:line 事件
      if (data.type === 'event' && data.event !== 'log:line') {
        console.log(`[ws:event] ${data.event || 'unknown'} keys=${Object.keys(data.data || {}).join(',')}`);
      }

      // 捕获 desktop:file 事件（send_file 产生的）
      if (data.type === 'event' && data.event === 'desktop:file') {
        const filePath = data.data?.path || data.data?.filePath;
        if (filePath && isAllowedFilePath(filePath)) {
          console.log(`[cola:file] Captured file event: ${filePath}`);
          collectedFiles.push(filePath);
        }
      }

      // 兜底：从所有事件 data 里扫描图片/音频路径
      if (data.type === 'event' && data.data) {
        const raw = JSON.stringify(data.data);
        const fileRegex = /(\/[\w\-\.\/]+\.(?:png|jpg|jpeg|gif|webp|mp3|wav|ogg|m4a|mp4|pdf))/gi;
        const matches = raw.match(fileRegex) || [];
        for (const m of matches) {
          if (!collectedFiles.includes(m) && isAllowedFilePath(m) && fs.existsSync(m)) {
            console.log(`[cola:file] Captured file from event data: ${m}`);
            collectedFiles.push(m);
          }
        }
      }

      if (data.type === 'event' && data.event === 'agent:complete') {
        clearTimeout(timeout);
        ws.close();
        const text = data.data?.finalText || data.data?.output || '';
        console.log(`[cola:complete] text=${text.length} chars, collectedFiles=${collectedFiles.length}`);
        // 从回复文本里提取文件路径
        const textFileRegex = /(\/[\w\-\.\/]+\.(?:png|jpg|jpeg|gif|webp|mp3|wav|ogg|m4a|mp4|pdf))/gi;
        const textMatches = text.match(textFileRegex) || [];
        for (const m of textMatches) {
          if (!collectedFiles.includes(m) && isAllowedFilePath(m) && fs.existsSync(m)) {
            collectedFiles.push(m);
          }
        }
        // 终极兜底：扫描 outputs 目录中本次调用期间新产生的媒体文件
        // 只扫描 beforeCallMs 之后创建的，且排除已经在 collectedFiles 里的
        const newMediaFiles = scanNewMediaFiles(beforeCallMs - 2000); // 留2秒容差
        for (const f of newMediaFiles) {
          if (!collectedFiles.includes(f)) {
            // 额外确认文件确实是在本次调用期间创建的（不是之前残留的）
            try {
              const stat = fs.statSync(f);
              if (stat.mtimeMs >= beforeCallMs - 2000) {
                console.log(`[cola:file] Found new media in outputs: ${f}`);
                collectedFiles.push(f);
              }
            } catch {}
          }
        }
        resolve({ text, files: collectedFiles });
      }

      if (data.type === 'response' && data.ok === false) {
        clearTimeout(timeout);
        ws.close();
        reject(new Error(data.error || 'Cola RPC failed'));
      }
    });

    ws.addEventListener('error', (e) => {
      clearTimeout(timeout);
      reject(new Error(`Cola WebSocket error: ${e.message || 'unknown'}`));
    });

    // 5 minute timeout（生成图片/音频等可能需要较长时间）
    timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Cola response timeout (300s)'));
    }, 300000);
  });
}

// ─── Lark SDK Client ──────────────────────────────────────────────────────────

const client = new Lark.Client({
  appId: FEISHU_APP_ID,
  appSecret: FEISHU_APP_SECRET,
  appType: Lark.AppType.SelfBuild,
  domain: Lark.Domain.Feishu,
});

// ─── WSClient (长连接) ────────────────────────────────────────────────────────

const wsClient = new Lark.WSClient({
  appId: FEISHU_APP_ID,
  appSecret: FEISHU_APP_SECRET,
  domain: Lark.Domain.Feishu,
});

// ─── Get tenant access token ──────────────────────────────────────────────────

let cachedToken = { token: '', expiresAt: 0 };

async function getTenantToken() {
  if (cachedToken.token && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }
  const resp = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET }),
  });
  const data = await resp.json();
  cachedToken = {
    token: data.tenant_access_token,
    expiresAt: Date.now() + (data.expire - 60) * 1000,
  };
  return cachedToken.token;
}

// ─── Image download helper ────────────────────────────────────────────────────

async function downloadImage(messageId, imageKey) {
  try {
    console.log(`[image] Downloading: msgId=${messageId}, imageKey=${imageKey}`);
    const token = await getTenantToken();

    const url = `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/resources/${imageKey}?type=image`;
    const resp = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[image] API ${resp.status}: ${errText.slice(0, 200)}`);
      return null;
    }

    const buf = Buffer.from(await resp.arrayBuffer());
    const imgPath = path.join(IMG_TMP_DIR, `${imageKey}.png`);
    fs.writeFileSync(imgPath, buf);

    console.log(`[image] Downloaded: ${imgPath} (${buf.length} bytes)`);
    return imgPath;
  } catch (err) {
    console.error('[image] Download failed:', err.message);
    return null;
  }
}

// ─── Reply helpers ────────────────────────────────────────────────────────────

async function replyText(msgId, text) {
  // 跳过空消息，避免飞书显示 [NO_MSG]
  if (!text || !text.trim() || text.trim().length < 2) {
    console.log('[replyText] Skipped empty or too-short message');
    return;
  }
  await client.im.message.reply({
    path: { message_id: msgId },
    data: {
      msg_type: 'text',
      content: JSON.stringify({ text }),
    },
  });
}

// 上传图片到飞书并返回 image_key
async function uploadImageToFeishu(imagePath) {
  try {
    const token = await getTenantToken();
    const formData = new FormData();
    formData.append('image_type', 'message');
    const fileBuffer = fs.readFileSync(imagePath);
    const blob = new Blob([fileBuffer], { type: 'image/png' });
    formData.append('image', blob, path.basename(imagePath));

    const resp = await fetch('https://open.feishu.cn/open-apis/im/v1/images', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    const data = await resp.json();
    if (data.code === 0 && data.data?.image_key) {
      console.log(`[image] Uploaded to Feishu: ${data.data.image_key}`);
      return data.data.image_key;
    }
    console.error('[image] Upload failed:', JSON.stringify(data).slice(0, 200));
    return null;
  } catch (err) {
    console.error('[image] Upload error:', err.message);
    return null;
  }
}

// 回复图片消息
async function replyImage(msgId, imageKey) {
  await client.im.message.reply({
    path: { message_id: msgId },
    data: {
      msg_type: 'image',
      content: JSON.stringify({ image_key: imageKey }),
    },
  });
}

// 上传文件到飞书（音频、PDF 等）并返回 file_key
async function uploadFileToFeishu(filePath, fileType = 'stream') {
  try {
    const token = await getTenantToken();
    const formData = new FormData();
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    // 飞书 file_type: opus/mp4/pdf/doc/xls/ppt/stream
    const typeMap = { '.mp3': 'stream', '.wav': 'stream', '.ogg': 'opus', '.m4a': 'mp4', '.mp4': 'mp4', '.pdf': 'pdf' };
    const feishuType = typeMap[ext] || fileType;

    formData.append('file_type', feishuType);
    formData.append('file_name', fileName);
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer]);
    formData.append('file', blob, fileName);

    const resp = await fetch('https://open.feishu.cn/open-apis/im/v1/files', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    const data = await resp.json();
    if (data.code === 0 && data.data?.file_key) {
      console.log(`[file] Uploaded to Feishu: ${data.data.file_key} (${fileName})`);
      return data.data.file_key;
    }
    console.error('[file] Upload failed:', JSON.stringify(data).slice(0, 200));
    return null;
  } catch (err) {
    console.error('[file] Upload error:', err.message);
    return null;
  }
}

// 回复文件消息
async function replyFile(msgId, fileKey) {
  await client.im.message.reply({
    path: { message_id: msgId },
    data: {
      msg_type: 'file',
      content: JSON.stringify({ file_key: fileKey }),
    },
  });
}

// 回复音频消息
async function replyAudio(msgId, fileKey) {
  await client.im.message.reply({
    path: { message_id: msgId },
    data: {
      msg_type: 'audio',
      content: JSON.stringify({ file_key: fileKey }),
    },
  });
}

// 主动发消息给用户（用于推送通知）
async function sendTextToUser(openId, text) {
  try {
    const token = await getTenantToken();
    const resp = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        receive_id: openId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      }),
    });
    const data = await resp.json();
    if (data.code === 0) {
      console.log(`[push] Sent to ${openId}: ${text.slice(0, 50)}...`);
      return true;
    }
    console.error(`[push] API error:`, JSON.stringify(data).slice(0, 300));
    return false;
  } catch (err) {
    console.error(`[push] Failed to send to ${openId}:`, err.message);
    return false;
  }
}

// 导出推送函数，供外部调用
const PUSH_FILE = path.join(__dirname, 'push-api.json');

// 监听推送请求文件（轮询方式实现主动推送）
function startPushWatcher() {
  setInterval(() => {
    if (!fs.existsSync(PUSH_FILE)) return;
    try {
      const raw = fs.readFileSync(PUSH_FILE, 'utf8');
      fs.unlinkSync(PUSH_FILE);
      const req = JSON.parse(raw);
      if (req.openId && req.text) {
        if (ALLOWED_OPEN_IDS.length > 0 && !ALLOWED_OPEN_IDS.includes(req.openId)) {
          console.log(`[push] Rejected push to ${req.openId}: not in whitelist`);
        } else {
          sendTextToUser(req.openId, req.text);
        }
      }
    } catch (e) {
      console.error('[push] Watch error:', e.message);
    }
  }, 2000);
  console.log('[push] 推送监听已启动（轮询 push-api.json）');
}

// ─── Event Dispatcher ─────────────────────────────────────────────────────────

const eventDispatcher = new Lark.EventDispatcher({});

eventDispatcher.register({
  'im.message.receive_v1': async (data) => {
    try {
      const message = data.message;
      const sender = data.sender;

      if (!message || !sender) {
        console.log('[event] Missing message or sender, skip');
        return;
      }

      const msgId = message.message_id;
      const chatType = message.chat_type;
      const msgType = message.message_type;
      const senderId = sender.sender_id?.open_id;

      // 去重
      if (!isNewMessage(msgId)) {
        console.log(`[event] Dup ${msgId}, skip`);
        return;
      }

      // 只处理单聊
      if (chatType !== 'p2p') {
        console.log(`[event] Non-P2P (${chatType}), skip`);
        return;
      }

      // 白名单校验
      if (ALLOWED_OPEN_IDS.length > 0 && !ALLOWED_OPEN_IDS.includes(senderId)) {
        console.log(`[event] User ${senderId} not in whitelist, reject`);
        await replyText(msgId, '⚠️ 暂无权限使用此机器人');
        return;
      }

      console.log(`[event] msgType=${msgType} chatType=${chatType} msgId=${msgId}`);

      const sessionKey = `feishu:${senderId}`;
      let userText = '';
      let attachments = [];

      // 首次对话标记：在处理消息前记录（此时历史中的 user 条目为 0）
      const firstConversation = isFirstConversation(senderId);

      // ── 首次欢迎消息 ──
      if (isFirstWelcome(senderId)) {
        try {
          await replyText(msgId, WELCOME_MESSAGE);
          markWelcomed(senderId);
          console.log(`[welcome] Sent welcome message to ${senderId}`);
        } catch (welcomeErr) {
          console.error(`[welcome] Failed to send welcome: ${welcomeErr.message}`);
        }
      }

      // ── 处理文本消息 ──
      if (msgType === 'text') {
        try {
          const parsed = JSON.parse(message.content);
          userText = (parsed.text || '').replace(/@\S+/g, '').trim();
        } catch {
          userText = message.content;
        }
      }

      // ── 处理图片消息 ──
      else if (msgType === 'image') {
        let imageKey;
        try {
          const parsed = JSON.parse(message.content);
          imageKey = parsed.image_key;
        } catch {}

        if (imageKey) {
          console.log(`[image] Received image: ${imageKey}`);
          const imgPath = await downloadImage(msgId, imageKey);
          if (imgPath) {
            attachments.push({
              path: imgPath,
              mimeType: 'image/png',
            });
            userText = '请看这张图片';
          } else {
            userText = '（用户发了一张图片，但下载失败了）';
          }
        } else {
          userText = '（用户发了一张图片，但无法解析）';
        }
      }

      // ── 处理富文本消息（post）——图文混合 ──
      else if (msgType === 'post') {
        try {
          const parsed = JSON.parse(message.content);
          console.log('[post] Raw content:', JSON.stringify(parsed).slice(0, 500));

          let texts = [];
          let imageKeys = [];

          // post 结构可能是：
          // 扁平：{ title, content: [[{tag, text/image_key}]] }
          // 多语言：{ zh_cn: { title, content: [...] } }
          const extractContent = (title, content) => {
            if (title) texts.push(title);
            if (content && Array.isArray(content)) {
              for (const line of content) {
                if (!Array.isArray(line)) continue;
                for (const elem of line) {
                  if (elem.tag === 'text') texts.push(elem.text);
                  else if (elem.tag === 'a') texts.push(elem.text || elem.href);
                  else if (elem.tag === 'img' && elem.image_key) imageKeys.push(elem.image_key);
                }
              }
            }
          };

          if (parsed.content && Array.isArray(parsed.content)) {
            // 扁平结构
            extractContent(parsed.title, parsed.content);
          } else {
            // 多语言嵌套结构
            for (const lang of Object.values(parsed)) {
              if (lang && typeof lang === 'object' && lang.content) {
                extractContent(lang.title, lang.content);
              }
            }
          }

          // 下载 post 里的图片
          for (const imgKey of imageKeys) {
            console.log(`[post] Found image: ${imgKey}`);
            const imgPath = await downloadImage(msgId, imgKey);
            if (imgPath) {
              attachments.push({ path: imgPath, mimeType: 'image/png' });
            }
          }

          userText = texts.join(' ').trim();
          if (!userText && attachments.length > 0) {
            userText = '请看这张图片';
          }
          if (attachments.length > 0 && userText && !userText.includes('图片')) {
            userText = userText + '（附带了图片）';
          }
        } catch (e) {
          console.error('[post] Parse error:', e.message);
          userText = '（用户发了一条富文本消息）';
        }
      }

      // ── 其他消息类型 ──
      else {
        console.log(`[event] Unsupported msg type: ${msgType}`);
        await replyText(msgId, `暂不支持 ${msgType} 类型消息，试试发文字或图片～`);
        return;
      }

      if (!userText && attachments.length === 0) {
        console.log('[event] Empty content, skip');
        return;
      }

      console.log(`[message] From ${senderId} (${msgType}): ${userText.slice(0, 80)}`);

      // 记录用户消息到历史
      appendToHistory(senderId, 'user', userText);

      // 调用 Cola（在消息前加飞书标记 + 简洁指令，让 Cola 区分来源并简短回复）
      const prefixedText = `[via Feishu] ${userText}`;
      const colaResult = await callColaAgent(prefixedText, sessionKey, attachments);
      const reply = colaResult.text || '';
      const eventFiles = colaResult.files || [];
      console.log(`[cola] Reply (${reply.length} chars, ${eventFiles.length} files): ${reply.slice(0, 80)}...`);
      if (eventFiles.length > 0) {
        console.log(`[cola:files] Collected from events: ${eventFiles.join(', ')}`);
      }

      // 清理临时图片
      for (const att of attachments) {
        try { fs.unlinkSync(att.path); } catch {}
      }

      // 空响应不回复（但如果有文件还是要发）
      if ((!reply || !reply.trim()) && eventFiles.length === 0) {
        console.log('[cola] Empty reply, skip');
        return;
      }

      // 飞书回复长度兜底：超过 500 字截断（飞书聊天窗口不适合长文）
      let trimmedReply = reply;
      if (trimmedReply.length > 500) {
        trimmedReply = trimmedReply.slice(0, 497) + '...';
      }

      // 清理 markdown 格式（飞书不渲染 markdown）
      let cleanReply = trimmedReply
        .replace(/\*\*(.+?)\*\*/g, '$1')       // **bold** → bold
        .replace(/\*(.+?)\*/g, '$1')            // *italic* → italic
        .replace(/__(.+?)__/g, '$1')            // __bold__ → bold
        .replace(/_(.+?)_/g, '$1')              // _italic_ → italic
        .replace(/~~(.+?)~~/g, '$1')            // ~~strike~~ → strike
        .replace(/`([^`]+)`/g, '$1')            // `code` → code
        .replace(/```[\s\S]*?```/g, (m) =>      // ```block``` → plain
          m.replace(/```\w*\n?/g, '').replace(/```/g, ''))
        .replace(/^#{1,6}\s+/gm, '')            // ### heading → heading
        .replace(/^\s*[-*+]\s+/gm, '• ')        // - list → • list
        .replace(/^\s*\d+\.\s+/gm, (m) => m)    // keep numbered lists
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2');  // [text](url) → text: url

      // 记录 Cola 回复到历史
      appendToHistory(senderId, 'assistant', reply);

      // ── 首次对话追加联动提示 ──
      if (firstConversation) {
        const hint = LARK_CLI_VERSION
          ? '\n\n💡 我还能帮你操作飞书——查群消息、管日程、搜文档，直接跟我说就行。'
          : '\n\n💡 我还能帮你操作飞书——查群消息、管日程、搜文档，直接跟我说就行。（需要安装 cola-lark-skills）';
        cleanReply = cleanReply + hint;
        console.log(`[hint] 首次对话，追加联动提示（lark-cli: ${LARK_CLI_VERSION || '未安装'}）`);
      }

      // 合并媒体文件来源：1) 从事件流收集的文件 2) 从回复文本里正则匹配的路径
      const mediaPathRegex = /(\/[\w\-\.\/]+\.(?:png|jpg|jpeg|gif|webp|mp3|wav|ogg|m4a|mp4|pdf))/gi;
      const mediaMatches = cleanReply.match(mediaPathRegex) || [];
      const textMediaPaths = mediaMatches.filter(p => isAllowedFilePath(p) && fs.existsSync(p));

      // 合并去重
      const allMediaPaths = [...eventFiles];
      for (const p of textMediaPaths) {
        if (!allMediaPaths.includes(p)) allMediaPaths.push(p);
      }
      const validMediaPaths = allMediaPaths.filter(p => fs.existsSync(p));

      // 分类：图片 vs 音频 vs 其他文件
      const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
      const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a']);
      const imagePaths = validMediaPaths.filter(p => IMAGE_EXTS.has(path.extname(p).toLowerCase()));
      const audioPaths = validMediaPaths.filter(p => AUDIO_EXTS.has(path.extname(p).toLowerCase()));
      const otherPaths = validMediaPaths.filter(p => !IMAGE_EXTS.has(path.extname(p).toLowerCase()) && !AUDIO_EXTS.has(path.extname(p).toLowerCase()));

      if (validMediaPaths.length > 0) {
        console.log(`[feishu] Will send ${imagePaths.length} image(s), ${audioPaths.length} audio(s), ${otherPaths.length} file(s)`);
        // 从文字回复里移除文件路径
        for (const mediaPath of validMediaPaths) {
          cleanReply = cleanReply.replace(mediaPath, '').trim();
        }
      }

      // 回复文字（如果清理后还有内容）
      if (cleanReply && cleanReply.trim()) {
        await replyText(msgId, cleanReply);
        console.log(`[feishu] Replied text to ${senderId}`);
      }

      // 发送图片
      for (const imgPath of imagePaths) {
        try {
          const imageKey = await uploadImageToFeishu(imgPath);
          if (imageKey) {
            await replyImage(msgId, imageKey);
            console.log(`[feishu] Replied image to ${senderId}: ${imgPath}`);
          }
        } catch (imgErr) {
          console.error(`[feishu] Image reply failed: ${imgErr.message}`);
        }
      }

      // 发送音频
      for (const audioPath of audioPaths) {
        try {
          const fileKey = await uploadFileToFeishu(audioPath);
          if (fileKey) {
            await replyFile(msgId, fileKey);
            console.log(`[feishu] Replied audio to ${senderId}: ${audioPath}`);
          }
        } catch (audioErr) {
          console.error(`[feishu] Audio reply failed: ${audioErr.message}`);
        }
      }

      // 发送其他文件（PDF 等）
      for (const filePath of otherPaths) {
        try {
          const fileKey = await uploadFileToFeishu(filePath);
          if (fileKey) {
            await replyFile(msgId, fileKey);
            console.log(`[feishu] Replied file to ${senderId}: ${filePath}`);
          }
        } catch (fileErr) {
          console.error(`[feishu] File reply failed: ${fileErr.message}`);
        }
      }

      // ── 清理超过1小时的临时文件 ──
      try {
        const now = Date.now();
        const ONE_HOUR = 60 * 60 * 1000;
        for (const f of fs.readdirSync(IMG_TMP_DIR)) {
          const fp = path.join(IMG_TMP_DIR, f);
          try {
            const stat = fs.statSync(fp);
            if (stat.isFile() && (now - stat.mtimeMs) > ONE_HOUR) {
              fs.unlinkSync(fp);
              console.log(`[cleanup] Removed old tmp file: ${f}`);
            }
          } catch {}
        }
      } catch {}

      // ── Issue 引导：错误回复后追加提示 ──
      if (shouldSendIssueHint(senderId, reply)) {
        try {
          await replyText(msgId, ISSUE_HINT_MESSAGE);
          markIssueSent(senderId);
          console.log(`[issue] Sent issue hint to ${senderId}`);
        } catch (issueErr) {
          console.error(`[issue] Failed to send issue hint: ${issueErr.message}`);
        }
      }

    } catch (err) {
      console.error('[bridge] Error:', err.message);
      try {
        const msgId = data?.message?.message_id;
        if (msgId) {
          await replyText(msgId, '⚠️ 出了点问题，请稍后重试');
        }
      } catch (e2) {
        console.error('[feishu] Failed to send error:', e2.message);
      }
    }
  },
});

// ─── Start Banner ─────────────────────────────────────────────────────────────

function buildStartBanner() {
  const lines = [];
  const W = 52; // 内容宽度

  const pad = (s) => {
    // 给每行右侧补空格，对齐右边框
    // 粗略计算：中文字符占2列，其余占1列
    let visual = 0;
    for (const ch of s) {
      visual += /[\u4e00-\u9fff\uff00-\uffef\u3000-\u303f]/.test(ch) ? 2 : 1;
    }
    const pad = W - visual;
    return s + (pad > 0 ? ' '.repeat(pad) : '');
  };

  lines.push('╔' + '═'.repeat(W) + '╗');
  lines.push('║' + pad('     飞书 ↔ Cola 桥接服务 v4') + '║');
  lines.push('╚' + '═'.repeat(W) + '╝');
  lines.push('');

  // 凭证来源
  lines.push(`  凭证来源:   ${CRED_SOURCE}`);

  // App ID（截断显示）
  const appIdDisplay = FEISHU_APP_ID.length > 30
    ? FEISHU_APP_ID.slice(0, 27) + '...'
    : FEISHU_APP_ID;
  lines.push(`  App ID:     ${appIdDisplay}`);

  // App Secret（不显示值，只显示是否已配置）
  lines.push(`  App Secret: ${FEISHU_APP_SECRET ? '✓ 已配置' : '✗ 未配置'}`);

  // Cola Token
  lines.push(`  Cola Token: ${COLA_GATEWAY_TOKEN ? '✓ 已配置' : '✗ 未找到'}`);

  // 白名单状态
  if (ALLOWED_OPEN_IDS.length > 0) {
    lines.push(`  白名单:     ✓ 已启用（${ALLOWED_OPEN_IDS.length} 个用户）`);
  } else {
    lines.push(`  白名单:     — 未设置（所有用户可用）`);
  }

  lines.push('');

  // lark-cli 状态
  if (LARK_CLI_VERSION) {
    lines.push(`  lark-cli:   ✓ ${LARK_CLI_VERSION}（飞书操作能力可用）`);
  } else {
    lines.push(`  lark-cli:   ✗ 未安装`);
  }

  // 权限检测
  if (LARK_CLI_SCOPES !== null) {
    const scopeChecks = REQUIRED_SCOPES.map(scope => {
      const ok = LARK_CLI_SCOPES.some(s => s === scope || s.startsWith(scope));
      return `${ok ? '✓' : '✗'} ${scope}`;
    });
    lines.push(`  权限检测:   ${scopeChecks.join(' / ')}`);

    // 缺失权限提示
    const missingScopes = REQUIRED_SCOPES.filter(scope =>
      !LARK_CLI_SCOPES.some(s => s === scope || s.startsWith(scope))
    );
    if (missingScopes.length > 0) {
      lines.push('');
      lines.push(`  ⚠️  缺少权限: ${missingScopes.join(', ')}`);
      lines.push(`      运行: lark-cli auth login --scope ${missingScopes.join(',')} 补充`);
    }
  } else {
    lines.push(`  权限检测:   — (lark-cli 未安装或未授权，跳过)`);
  }

  lines.push('');
  lines.push('  支持:       文本 / 图片 / 富文本 / 主动推送');
  lines.push('');
  lines.push('  正在连接飞书服务器...');
  lines.push('');

  return lines.join('\n');
}

console.log(buildStartBanner());

// ─── 静默重连逻辑 ─────────────────────────────────────────────────────────────

let isConnected = false;
let reconnectTimer = null;
const RECONNECT_INTERVAL = 15000; // 15秒重试一次

async function connectWithRetry() {
  try {
    await wsClient.start({ eventDispatcher });
    if (!isConnected) {
      console.log('✅ 长连接已建立，等待消息中...');
      isConnected = true;
    } else {
      console.log('✅ 重连成功');
    }
    startPushWatcher();
    // 清除重连定时器
    if (reconnectTimer) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    }
  } catch (err) {
    if (!isConnected) {
      // 首次连接失败，提示一次
      console.error(`⚠️ 连接失败（${err.message}），将在后台自动重试...`);
    }
    // 静默重试，不再刷屏
    if (!reconnectTimer) {
      reconnectTimer = setInterval(async () => {
        try {
          await wsClient.start({ eventDispatcher });
          console.log('✅ 重连成功');
          isConnected = true;
          startPushWatcher();
          if (reconnectTimer) {
            clearInterval(reconnectTimer);
            reconnectTimer = null;
          }
        } catch {
          // 静默，不输出
        }
      }, RECONNECT_INTERVAL);
    }
  }
}

connectWithRetry();

process.on('SIGINT', () => { console.log('\n🛑 正在关闭...'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n🛑 正在关闭...'); process.exit(0); });

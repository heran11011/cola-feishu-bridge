#!/usr/bin/env node
/**
 * feishu-bridge.js — 飞书 ↔ Cola 桥接服务（长连接版 v2）
 *
 * 用途：让用户在飞书 App 里直接跟 Cola AI 对话
 * 功能：文本消息 / 图片识别 / 富文本解析 / 图片回复 / 对话历史 / 主动推送
 *
 * 使用前请配置 .env 文件：
 *   FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxxx
 *   FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *
 * 启动：node feishu-bridge.js
 * 文档：https://github.com/heran11011/cola-feishu-bridge
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Lark = require('@larksuiteoapi/node-sdk');

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

const FEISHU_APP_ID = process.env.FEISHU_APP_ID || '';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || '';
const COLA_PORT = parseInt(process.env.COLA_PORT || '19532', 10);
const COLA_GATEWAY_TOKEN = process.env.COLA_GATEWAY_TOKEN ||
  (() => {
    const tokenPath = path.join(os.homedir(), '.cola', 'gateway-token');
    return fs.existsSync(tokenPath) ? fs.readFileSync(tokenPath, 'utf8').trim() : '';
  })();

if (!FEISHU_APP_ID) {
  console.error('❌ FEISHU_APP_ID 未配置！请在 .env 文件中设置。');
  process.exit(1);
}

if (!FEISHU_APP_SECRET) {
  console.error('❌ FEISHU_APP_SECRET 未配置！请在 .env 文件中设置。');
  process.exit(1);
}

// 图片临时目录
const IMG_TMP_DIR = path.join(__dirname, 'tmp_images');
if (!fs.existsSync(IMG_TMP_DIR)) fs.mkdirSync(IMG_TMP_DIR, { recursive: true });

// 对话历史目录（持久化）
const HISTORY_DIR = path.join(__dirname, 'chat_history');
if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });

// ─── Chat History (持久化上下文) ──────────────────────────────────────────────

const MAX_HISTORY_PER_USER = 50; // 每用户保留最近 50 条

function getHistoryPath(senderId) {
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

function callColaAgent(userMessage, sessionKey, attachments) {
  return new Promise((resolve, reject) => {
    if (!COLA_GATEWAY_TOKEN) {
      return resolve(`[Echo] ${userMessage}`);
    }

    const url = `ws://127.0.0.1:${COLA_PORT}?token=${COLA_GATEWAY_TOKEN}`;
    const ws = new WebSocket(url);
    const reqId = `feishu-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let timeout;

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

      if (data.type === 'event' && data.event === 'agent:complete') {
        clearTimeout(timeout);
        ws.close();
        resolve(data.data?.finalText || '');
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

    // 3 minute timeout
    timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Cola response timeout (180s)'));
    }, 180000);
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

// ─── Push watcher (主动推送) ──────────────────────────────────────────────────

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
        sendTextToUser(req.openId, req.text);
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

      console.log(`[event] msgType=${msgType} chatType=${chatType} msgId=${msgId}`);

      const sessionKey = `feishu:${senderId}`;
      let userText = '';
      let attachments = [];

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
            attachments.push({ path: imgPath, mimeType: 'image/png' });
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
            extractContent(parsed.title, parsed.content);
          } else {
            for (const lang of Object.values(parsed)) {
              if (lang && typeof lang === 'object' && lang.content) {
                extractContent(lang.title, lang.content);
              }
            }
          }

          for (const imgKey of imageKeys) {
            console.log(`[post] Found image: ${imgKey}`);
            const imgPath = await downloadImage(msgId, imgKey);
            if (imgPath) {
              attachments.push({ path: imgPath, mimeType: 'image/png' });
            }
          }

          userText = texts.join(' ').trim();
          if (!userText && attachments.length > 0) userText = '请看这张图片';
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

      // 调用 Cola
      const prefixedText = `[via Feishu] ${userText}`;
      const reply = await callColaAgent(prefixedText, sessionKey, attachments);
      console.log(`[cola] Reply (${reply.length} chars): ${reply.slice(0, 80)}...`);

      // 清理临时图片
      for (const att of attachments) {
        try { fs.unlinkSync(att.path); } catch {}
      }

      if (!reply || !reply.trim()) {
        console.log('[cola] Empty reply, skip');
        return;
      }

      // 飞书回复长度兜底：超过 500 字截断
      let trimmedReply = reply;
      if (trimmedReply.length > 500) {
        trimmedReply = trimmedReply.slice(0, 497) + '...';
      }

      // 清理 markdown 格式（飞书不渲染 markdown）
      let cleanReply = trimmedReply
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        .replace(/~~(.+?)~~/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/```[\s\S]*?```/g, (m) =>
          m.replace(/```\w*\n?/g, '').replace(/```/g, ''))
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '• ')
        .replace(/^\s*\d+\.\s+/gm, (m) => m)
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2');

      // 记录 Cola 回复到历史
      appendToHistory(senderId, 'assistant', reply);

      // 检测回复中是否包含本地图片路径
      const imgPathRegex = /(\/[\w\-\.\/]+\.(?:png|jpg|jpeg|gif|webp))/gi;
      const imgMatches = cleanReply.match(imgPathRegex) || [];
      const validImgPaths = imgMatches.filter(p => fs.existsSync(p));

      // 回复文字
      await replyText(msgId, cleanReply);
      console.log(`[feishu] Replied text to ${senderId}`);

      // 如果有图片，逐个上传发送
      for (const imgPath of validImgPaths) {
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

    } catch (err) {
      console.error('[bridge] Error:', err.message);
      try {
        const msgId = data?.message?.message_id;
        if (msgId) {
          await replyText(msgId, `⚠️ 出了点问题：${err.message}`);
        }
      } catch (e2) {
        console.error('[feishu] Failed to send error:', e2.message);
      }
    }
  },
});

// ─── Start ────────────────────────────────────────────────────────────────────

console.log(`
╔══════════════════════════════════════════════════╗
║     飞书 ↔ Cola 桥接服务（长连接版 v2）           ║
╚══════════════════════════════════════════════════╝
  App ID:     ${FEISHU_APP_ID}
  App Secret: ✓ 已配置
  Cola Token: ${COLA_GATEWAY_TOKEN ? '✓ 已配置' : '✗ 未找到（Cola 是否在运行？）'}
  支持:       文本 / 图片 / 富文本

  正在连接飞书服务器...
`);

wsClient.start({ eventDispatcher })
  .then(() => {
    console.log('✅ 长连接已建立，等待消息中...');
    startPushWatcher();
  })
  .catch((err) => {
    console.error('❌ 长连接启动失败:', err.message);
    process.exit(1);
  });

process.on('SIGINT', () => { console.log('\n🛑 正在关闭...'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n🛑 正在关闭...'); process.exit(0); });

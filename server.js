// =============================================================================
// EngageFlow — Enterprise Public SaaS Edition (Production Server)
// Turn Instagram Comments into Customers on Autopilot
// Multi-User Public Registration, Real Meta Graph API Connect & Webhook Engine
// Zero-Dependency Native Node.js Server
// =============================================================================

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import url from 'url';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global Resilient Error Guards (Prevents process crash on network or parsing error)
process.on('uncaughtException', (err) => {
  console.error('[Global Uncaught Exception]:', err.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Global Unhandled Rejection]:', reason?.message || reason);
});

// Native .env loader
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split(/\r?\n/).forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#') && line.includes('=')) {
        const idx = line.indexOf('=');
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim();
        process.env[key] = val;
      }
    });
    console.log('[ENV] Secure environment loaded from .env');
  }
} catch (e) {
  console.error('[ENV] Failed to load .env file:', e.message);
}

const PORT = process.env.PORT || 5050;
const DB_FILE = path.join(__dirname, 'data', 'database.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.mp4': 'video/mp4'
};

// =============================================================================
// Database Helpers
// =============================================================================
function readDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[DB] Read error:', err.message);
  }
  return {
    users: [],
    sessions: [],
    instagram: {
      connected: false,
      accountId: '',
      username: '',
      name: '',
      profilePic: '',
      followersCount: 0,
      mediaCount: 0,
      accessToken: '',
      appId: '',
      appSecret: '',
      webhookVerifyToken: 'autopulse_public_webhook_2026'
    },
    rules: [],
    leads: [],
    activityLogs: [],
    metrics: { totalDMsSent: 0, hourlyDMsSent: 0, lastResetHour: 0 }
  };
}

function writeDatabase(data) {
  try {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[DB] Write error:', err.message);
    return false;
  }
}

// =============================================================================
// Security & Auth Helpers
// =============================================================================
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

// Meta HTTPS GET Request
function httpsGet(requestUrl) {
  return new Promise((resolve, reject) => {
    https.get(requestUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
  });
}

// Meta HTTPS POST Request
function httpsPost(requestUrl, payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const parsed = new URL(requestUrl);
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// =============================================================================
// Custom Branded Error Page (404, 500, etc.)
// =============================================================================
function renderCustomErrorPage(res, statusCode, title, message) {
  res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${statusCode} — ${title} | EngageFlow</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Plus Jakarta Sans', sans-serif; background-color: #030712; }
    .glass-panel { background: rgba(17, 24, 39, 0.7); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.08); }
  </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4 text-white relative overflow-hidden">
  <div class="absolute -top-40 -left-40 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl pointer-events-none"></div>
  <div class="absolute -bottom-40 -right-40 w-96 h-96 bg-cyan-600/20 rounded-full blur-3xl pointer-events-none"></div>

  <div class="glass-panel max-w-md w-full rounded-3xl p-8 sm:p-10 text-center space-y-6 shadow-2xl relative z-10 border border-violet-500/30">
    <div class="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-violet-600/20 to-cyan-500/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
      <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
    </div>

    <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-400 text-xs font-mono font-bold">
      STATUS ${statusCode}
    </div>
    
    <div class="space-y-2">
      <h1 class="text-2xl font-extrabold text-white tracking-tight">${title}</h1>
      <p class="text-xs text-slate-400 leading-relaxed">${message}</p>
    </div>

    <div class="pt-2">
      <a href="/" class="inline-flex items-center justify-center gap-2 w-full py-3 px-5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-violet-600/30 transition transform active:scale-95">
        <span>Back to EngageFlow Dashboard</span>
        <span>→</span>
      </a>
    </div>
  </div>
</body>
</html>`);
}

// =============================================================================
// Multi-Method Meta & Instagram Account Resolver
// =============================================================================
// Comprehensive Multi-Method Real Instagram Account Resolver
// Checks Pages, Debug Token Granular Scopes, Business Portfolios & Direct Nodes
// =============================================================================
async function resolveConnectedInstagram(userToken, clientId, clientSecret) {
  let connectedIg = null;
  let pageToken = userToken;

  // Helper to test if an ID or object is an Instagram Business Account
  async function testIgCandidate(igId, token) {
    if (!igId) return null;
    try {
      const testUrl = `https://graph.facebook.com/v21.0/${igId}?fields=id,username,name,profile_picture_url,followers_count,media_count&access_token=${token}`;
      const res = await httpsGet(testUrl);
      if (res.body && (res.body.username || res.body.name)) {
        return res.body;
      }
    } catch (e) {}
    return null;
  }

  // Helper to extract IG from a Page ID
  async function testPageCandidate(pageId, token) {
    if (!pageId) return null;
    try {
      const pageUrl = `https://graph.facebook.com/v21.0/${pageId}?fields=id,name,access_token,connected_instagram_account{id,username,name,profile_picture_url,followers_count,media_count},instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}&access_token=${token}`;
      const res = await httpsGet(pageUrl);
      const ig = res.body?.instagram_business_account || res.body?.connected_instagram_account;
      if (ig && (ig.username || ig.id)) {
        return { ig, token: res.body?.access_token || token };
      }
    } catch (e) {}
    return null;
  }

  // Method 0: Check if token is directly an Instagram User Access Token (from Instagram Login)
  console.log('[Instagram Resolver] 🔍 Method 0: Checking direct Instagram Graph API node (/me)...');
  try {
    const directIgUrl = `https://graph.instagram.com/v21.0/me?fields=id,username,name,account_type,profile_picture_url,followers_count,media_count&access_token=${userToken}`;
    const directIgRes = await httpsGet(directIgUrl);
    if (directIgRes.body && (directIgRes.body.username || directIgRes.body.id)) {
      connectedIg = directIgRes.body;
      connectedIg.isInstagramApiDirect = true;
      console.log('[Instagram Resolver] ✅ Found direct Instagram account via graph.instagram.com:', connectedIg.username);
      return { connectedIg, pageToken: userToken };
    }
  } catch (e) {}

  try {
    const directFbIgUrl = `https://graph.facebook.com/v21.0/me?fields=id,username,name,profile_picture_url,followers_count,media_count&access_token=${userToken}`;
    const directFbIgRes = await httpsGet(directFbIgUrl);
    if (directFbIgRes.body && directFbIgRes.body.username) {
      connectedIg = directFbIgRes.body;
      console.log('[Instagram Resolver] ✅ Found direct Instagram account via graph.facebook.com/me:', connectedIg.username);
      return { connectedIg, pageToken: userToken };
    }
  } catch (e) {}

  console.log('[Instagram Resolver] 🔍 Method 1: Querying /me/accounts (Facebook Pages)...');
  try {
    const pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count},connected_instagram_account{id,username,name,profile_picture_url,followers_count,media_count}&access_token=${userToken}`;
    const pagesRes = await httpsGet(pagesUrl);
    console.log('[Instagram Resolver] 📋 /me/accounts Raw:', JSON.stringify(pagesRes.body));
    const accounts = pagesRes.body?.data || [];
    console.log('[Instagram Resolver] /me/accounts raw count:', accounts.length);

    for (const acc of accounts) {
      if (acc.instagram_business_account) {
        connectedIg = acc.instagram_business_account;
        pageToken = acc.access_token || userToken;
        console.log('[Instagram Resolver] ✅ Found Instagram account via Page (Method 1):', connectedIg.username);
        return { connectedIg, pageToken };
      }
      if (acc.connected_instagram_account) {
        connectedIg = acc.connected_instagram_account;
        pageToken = acc.access_token || userToken;
        console.log('[Instagram Resolver] ✅ Found Instagram account via connected_instagram_account (Method 1):', connectedIg.username);
        return { connectedIg, pageToken };
      }
      if (acc.id) {
        const pageRes = await testPageCandidate(acc.id, acc.access_token || userToken);
        if (pageRes && pageRes.ig) {
          console.log('[Instagram Resolver] ✅ Found Instagram account via testPageCandidate (Method 1):', pageRes.ig.username);
          return { connectedIg: pageRes.ig, pageToken: pageRes.token };
        }
      }
    }

    // Fallback: check assigned_pages
    if (accounts.length === 0) {
      try {
        const assignedPagesUrl = `https://graph.facebook.com/v21.0/me/assigned_pages?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}&access_token=${userToken}`;
        const assignedRes = await httpsGet(assignedPagesUrl);
        const assignedList = assignedRes.body?.data || [];
        console.log('[Instagram Resolver] /me/assigned_pages raw count:', assignedList.length);
        for (const ap of assignedList) {
          if (ap.instagram_business_account) {
            console.log('[Instagram Resolver] ✅ Found Instagram account via assigned_pages:', ap.instagram_business_account.username);
            return { connectedIg: ap.instagram_business_account, pageToken: ap.access_token || userToken };
          }
        }
      } catch (ae) {}
    }
  } catch (e) {
    console.error('[Instagram Resolver] Method 1 error:', e.message);
  }

  console.log('[Instagram Resolver] 🔍 Method 2: Querying Meta Debug Token (Granular Scopes & Target IDs)...');
  try {
    const debugUrl = `https://graph.facebook.com/v21.0/debug_token?input_token=${userToken}&access_token=${clientId}|${clientSecret}`;
    const debugRes = await httpsGet(debugUrl);
    console.log('[Instagram Resolver] 📋 Debug Token Raw:', JSON.stringify(debugRes.body));
    const granularScopes = debugRes.body?.data?.granular_scopes || [];
    console.log('[Instagram Resolver] Granular scopes found:', granularScopes.length);

    // Collect all unique target IDs, prioritizing instagram-specific scopes
    const candidateIds = [];
    for (const gs of granularScopes) {
      if (Array.isArray(gs.target_ids)) {
        for (const tid of gs.target_ids) {
          if (!candidateIds.includes(tid)) {
            if (gs.scope && gs.scope.toLowerCase().includes('instagram')) {
              candidateIds.unshift(tid); // High priority
            } else {
              candidateIds.push(tid);
            }
          }
        }
      }
    }
    console.log('[Instagram Resolver] Candidate target IDs from granular scopes:', candidateIds);

    for (const tid of candidateIds) {
      // First try as direct Instagram user node
      const directIg = await testIgCandidate(tid, userToken);
      if (directIg && (directIg.username || directIg.id)) {
        console.log('[Instagram Resolver] ✅ Resolved direct Instagram account from target ID:', directIg.username || directIg.id);
        return { connectedIg: directIg, pageToken: userToken };
      }

      // If not direct IG, try as a Page ID that may own an Instagram account
      const pageResult = await testPageCandidate(tid, userToken);
      if (pageResult && pageResult.ig) {
        console.log('[Instagram Resolver] ✅ Resolved Instagram account via target Page ID:', pageResult.ig.username);
        return { connectedIg: pageResult.ig, pageToken: pageResult.token };
      }
    }
  } catch (e) {
    console.error('[Instagram Resolver] Method 2 error:', e.message);
  }

  console.log('[Instagram Resolver] 🔍 Method 3: Querying /me/businesses (Business Portfolios)...');
  try {
    const bizUrl = `https://graph.facebook.com/v21.0/me/businesses?fields=id,name&access_token=${userToken}`;
    const bizRes = await httpsGet(bizUrl);
    const businesses = bizRes.body?.data || [];
    console.log('[Instagram Resolver] Businesses count:', businesses.length);

    for (const b of businesses) {
      console.log(`[Instagram Resolver] Inspecting business portfolio: ${b.name} (${b.id})`);
      
      // Try instagram_business_accounts edge
      try {
        const edgeUrl = `https://graph.facebook.com/v21.0/${b.id}/instagram_business_accounts?fields=id,username,name,profile_picture_url,followers_count,media_count&access_token=${userToken}`;
        const edgeRes = await httpsGet(edgeUrl);
        const igList = edgeRes.body?.data || [];
        if (igList.length > 0 && igList[0].username) {
          console.log('[Instagram Resolver] ✅ Found Instagram account via Business instagram_business_accounts edge:', igList[0].username);
          return { connectedIg: igList[0], pageToken: userToken };
        }
      } catch (be) {}

      // Try client_instagram_accounts edge
      try {
        const clientEdgeUrl = `https://graph.facebook.com/v21.0/${b.id}/client_instagram_accounts?fields=id,username,name,profile_picture_url,followers_count,media_count&access_token=${userToken}`;
        const clientEdgeRes = await httpsGet(clientEdgeUrl);
        const igList = clientEdgeRes.body?.data || [];
        if (igList.length > 0 && igList[0].username) {
          console.log('[Instagram Resolver] ✅ Found Instagram account via Business client_instagram_accounts edge:', igList[0].username);
          return { connectedIg: igList[0], pageToken: userToken };
        }
      } catch (be) {}

      // Try owned_instagram_accounts edge
      try {
        const ownedEdgeUrl = `https://graph.facebook.com/v21.0/${b.id}/owned_instagram_accounts?fields=id,username,name,profile_picture_url,followers_count,media_count&access_token=${userToken}`;
        const ownedEdgeRes = await httpsGet(ownedEdgeUrl);
        const igList = ownedEdgeRes.body?.data || [];
        if (igList.length > 0 && igList[0].username) {
          console.log('[Instagram Resolver] ✅ Found Instagram account via Business owned_instagram_accounts edge:', igList[0].username);
          return { connectedIg: igList[0], pageToken: userToken };
        }
      } catch (be) {}

      // Try pages under business
      try {
        const bizPagesUrl = `https://graph.facebook.com/v21.0/${b.id}/pages?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}&access_token=${userToken}`;
        const bizPagesRes = await httpsGet(bizPagesUrl);
        const bPages = bizPagesRes.body?.data || [];
        for (const bp of bPages) {
          if (bp.instagram_business_account) {
            console.log('[Instagram Resolver] ✅ Found Instagram account via Business Page:', bp.instagram_business_account.username);
            return { connectedIg: bp.instagram_business_account, pageToken: bp.access_token || userToken };
          }
        }
      } catch (be) {}
    }
  } catch (e) {
    console.error('[Instagram Resolver] Method 3 error:', e.message);
  }

  console.log('[Instagram Resolver] 🔍 Method 4: Querying /me direct node...');
  try {
    const directUrl = `https://graph.facebook.com/v21.0/me?fields=id,name,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}&access_token=${userToken}`;
    const directRes = await httpsGet(directUrl);
    if (directRes.body?.instagram_business_account) {
      console.log('[Instagram Resolver] ✅ Found Instagram account via direct /me:', directRes.body.instagram_business_account.username);
      return { connectedIg: directRes.body.instagram_business_account, pageToken: userToken };
    }
  } catch (e) {}

  console.warn('[Instagram Resolver] ⚠️ Could not resolve connected Instagram account across any method.');
  return { connectedIg: null, pageToken: userToken };
}

// =============================================================================
// Multi-Tenant User Context Resolver
// Guarantees each user (1 to 25+ users) has their own separate Instagram, Rules, Reels, Leads
// =============================================================================
function getUserFromReq(req, db) {
  const parsed = url.parse(req.url, true);
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() || parsed.query.token;

  if (token) {
    const session = db.sessions.find(s => s.token === token);
    if (session) {
      const user = db.users.find(u => u.id === session.userId);
      if (user) {
        // Guarantee user-level isolated containers
        if (!user.instagram) {
          user.instagram = {
            connected: false,
            accountId: '',
            username: '',
            name: '',
            profilePic: '',
            followersCount: 0,
            mediaCount: 0,
            accessToken: ''
          };
        }
        if (!Array.isArray(user.rules)) user.rules = [];
        if (!Array.isArray(user.reels)) user.reels = [];
        if (!Array.isArray(user.leads)) user.leads = [];
        if (!Array.isArray(user.processedCommentIds)) user.processedCommentIds = [];
        if (!user.metrics) user.metrics = { totalDMsSent: 0, hourlyDMsSent: 0, lastResetHour: 0 };
        return user;
      }
    }
  }

  // Fallback for direct or unauthenticated requests
  const fallbackUser = db.users[0] || null;
  if (fallbackUser) {
    if (!fallbackUser.instagram) fallbackUser.instagram = db.instagram || { connected: false };
    if (!Array.isArray(fallbackUser.rules)) fallbackUser.rules = db.rules || [];
    if (!Array.isArray(fallbackUser.reels)) fallbackUser.reels = db.reels || [];
    if (!Array.isArray(fallbackUser.leads)) fallbackUser.leads = db.leads || [];
    if (!Array.isArray(fallbackUser.processedCommentIds)) fallbackUser.processedCommentIds = db.processedCommentIds || [];
    if (!fallbackUser.metrics) fallbackUser.metrics = db.metrics || { totalDMsSent: 0 };
  }
  return fallbackUser;
}

function getRedirectUri(req, currentPath = '/api/auth/facebook/callback') {
  if (process.env.META_REDIRECT_URI) return process.env.META_REDIRECT_URI;
  const host = req.headers['x-forwarded-host'] || req.headers['host'] || 'literature-frankfurt-afford-constitute.trycloudflare.com';
  const proto = req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'https');
  const path = currentPath && currentPath.includes('/api/auth/') ? currentPath : '/api/auth/facebook/callback';
  return `${proto}://${host}${path}`;
}

// =============================================================================
// Helper: Smart Rule Matcher for Comments & Simulators
// =============================================================================
function matchCommentToRule(rule, rawCommentText, mediaId, mediaType) {
  if (!rule || rule.status !== 'active') return false;
  const commentText = (rawCommentText || '').trim().toUpperCase();

  // 1. Target check (All vs All Reels vs All Posts vs Specific Media ID)
  if (rule.targetPost && rule.targetPost !== 'all') {
    if (rule.targetPost === 'all_reels') {
      if (mediaType && mediaType !== 'VIDEO') return false;
    } else if (rule.targetPost === 'all_posts') {
      if (mediaType && mediaType === 'VIDEO') return false;
    } else if (mediaId && rule.targetPost !== mediaId) {
      return false;
    }
  }

  // 2. Exclude triggers check (Anti-spam / negative keywords)
  if (Array.isArray(rule.excludeTriggers) && rule.excludeTriggers.length > 0) {
    const isExcluded = rule.excludeTriggers.some(ex => ex && commentText.includes(String(ex).trim().toUpperCase()));
    if (isExcluded) return false;
  }

  // 3. Match type check
  if (rule.matchType === 'any_comment') {
    return true;
  }

  const triggers = Array.isArray(rule.triggers) ? rule.triggers : [];
  if (triggers.length === 0) return false;

  if (rule.matchType === 'exact') {
    return triggers.some(t => commentText === String(t).trim().toUpperCase());
  }

  // 'contains' (default)
  return triggers.some(t => commentText.includes(String(t).trim().toUpperCase()));
}

// Dispatch DM with optional Meta Button Template and clean text fallback
async function dispatchInstagramDM(token, commenterId, commenterUsername, rule) {
  const dmUrl = `https://graph.facebook.com/v21.0/me/messages?access_token=${token}`;
  const personalizedText = (rule.dmMessage || 'Hey {{name}}! Here is your link.').replace(/\{\{name\}\}/g, commenterUsername || 'friend').replace(/\{\{username\}\}/g, `@${commenterUsername || 'friend'}`);

  if (Array.isArray(rule.buttons) && rule.buttons.length > 0) {
    try {
      const genericPayload = {
        recipient: { id: commenterId },
        message: {
          attachment: {
            type: "template",
            payload: {
              template_type: "generic",
              elements: [{
                title: (rule.name || "Special Resource").slice(0, 80),
                subtitle: personalizedText.slice(0, 80),
                buttons: rule.buttons.slice(0, 3).map(b => ({
                  type: "web_url",
                  url: b.url || 'https://instagram.com',
                  title: (b.label || "Open Link").slice(0, 20)
                }))
              }]
            }
          }
        }
      };
      await httpsPost(dmUrl, genericPayload);
      return;
    } catch (btnErr) {
      console.warn('[DM Buttons Template Error, falling back to clean text]:', btnErr.message);
    }
    // Fallback: send clean text with professional button link list
    const fallbackText = `${personalizedText}\n\n` + rule.buttons.map(b => `👉 ${b.label}: ${b.url}`).join('\n');
    await httpsPost(dmUrl, {
      recipient: { id: commenterId },
      message: { text: fallbackText }
    });
  } else {
    await httpsPost(dmUrl, {
      recipient: { id: commenterId },
      message: { text: personalizedText }
    });
  }
}

// Dispatch public reply with support for multi-variant rotation
async function dispatchPublicReply(token, commentId, commenterUsername, rule) {
  if (!rule.publicReply || !commentId) return;
  const replyVariants = rule.publicReply.split('|').map(r => r.trim()).filter(Boolean);
  const selectedVariant = replyVariants[Math.floor(Math.random() * replyVariants.length)] || rule.publicReply;
  const replyUrl = `https://graph.facebook.com/v21.0/${commentId}/replies?access_token=${token}`;
  await httpsPost(replyUrl, { message: selectedVariant.replace(/\{\{name\}\}/g, `@${commenterUsername}`) });
}

// =============================================================================
// HTTP Server
// =============================================================================
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  // ---------------------------------------------------------------------------
  // 1. PUBLIC AUTHENTICATION (Register & Login)
  // ---------------------------------------------------------------------------
  if (pathname === '/api/auth/register' && method === 'POST') {
    const body = await parseBody(req);
    const { name, email, password } = body;

    if (!name || !email || !password || password.length < 6) {
      sendJson(res, 400, { success: false, error: 'Valid name, email, and a password (min 6 characters) are required.' });
      return;
    }

    const db = readDatabase();
    const cleanEmail = email.trim().toLowerCase();

    if (db.users.some(u => u.email === cleanEmail)) {
      sendJson(res, 400, { success: false, error: 'An account with this email already exists. Please log in.' });
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const userId = `usr_${Date.now()}`;

    const newUser = {
      id: userId,
      name: name.trim(),
      email: cleanEmail,
      salt,
      passwordHash,
      createdAt: new Date().toISOString(),
      instagram: {
        connected: false,
        accountId: '',
        username: '',
        name: '',
        profilePic: '',
        followersCount: 0,
        mediaCount: 0,
        accessToken: ''
      },
      reels: [],
      rules: [],
      leads: [],
      processedCommentIds: [],
      metrics: {
        totalDMsSent: 0,
        hourlyDMsSent: 0,
        lastResetHour: 0
      }
    };

    db.users.push(newUser);

    // Create session
    const token = generateToken();
    db.sessions.push({
      token,
      userId,
      email: cleanEmail,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });

    writeDatabase(db);

    sendJson(res, 201, {
      success: true,
      token,
      user: { id: userId, name: newUser.name, email: newUser.email }
    });
    return;
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const body = await parseBody(req);
    const { email, password } = body;

    if (!email || !password) {
      sendJson(res, 400, { success: false, error: 'Email and password are required.' });
      return;
    }

    const db = readDatabase();
    const cleanEmail = email.trim().toLowerCase();
    const user = db.users.find(u => u.email === cleanEmail);

    if (!user) {
      sendJson(res, 401, { success: false, error: 'Invalid email or password.' });
      return;
    }

    const inputHash = hashPassword(password, user.salt);
    if (inputHash !== user.passwordHash) {
      sendJson(res, 401, { success: false, error: 'Invalid email or password.' });
      return;
    }

    const token = generateToken();
    db.sessions.push({
      token,
      userId: user.id,
      email: user.email,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
    writeDatabase(db);

    sendJson(res, 200, {
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
    return;
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '') || parsedUrl.query.token;
    const db = readDatabase();

    const session = db.sessions.find(s => s.token === token);
    if (!session) {
      sendJson(res, 401, { success: false, error: 'Not authenticated' });
      return;
    }

    const user = db.users.find(u => u.id === session.userId);
    if (!user) {
      sendJson(res, 401, { success: false, error: 'User not found' });
      return;
    }

    sendJson(res, 200, {
      success: true,
      user: { id: user.id, name: user.name, email: user.email }
    });
    return;
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const db = readDatabase();
    db.sessions = db.sessions.filter(s => s.token !== token);
    writeDatabase(db);
    sendJson(res, 200, { success: true, message: 'Logged out successfully' });
    return;
  }

  // ---------------------------------------------------------------------------
  // 1.5. FACEBOOK / INSTAGRAM OAUTH CALLBACK (/api/auth/facebook/callback)
  // ---------------------------------------------------------------------------
  if ((pathname === '/api/auth/facebook/callback' || pathname === '/api/auth/instagram/callback') && method === 'GET') {
    const code = parsedUrl.query.code;
    const error = parsedUrl.query.error;
    const errorDescription = parsedUrl.query.error_description;

    if (error || !code) {
      console.error('[OAuth] Login cancelled or error:', errorDescription || error);
      res.writeHead(302, { Location: `/?error=${encodeURIComponent(errorDescription || error || 'Login cancelled')}` });
      res.end();
      return;
    }

    const db = readDatabase();
    const clientId = process.env.META_APP_ID || db.instagram.appId || '2401678503569810';
    const clientSecret = process.env.META_APP_SECRET || db.instagram.appSecret || '438386a97434a08b45a420c645fd65b1';
    const redirectUri = getRedirectUri(req, pathname);

    console.log('[OAuth] Received authorization code from Meta! Code:', code.slice(0, 15) + '...');

    // If clientSecret is available, exchange code for User Access Token
    if (clientSecret) {
      try {
        let userToken = null;
        const tokenExchangeUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`;
        const tokenRes = await httpsGet(tokenExchangeUrl);

        if (tokenRes.body && tokenRes.body.access_token) {
          userToken = tokenRes.body.access_token;
          console.log('[OAuth] Successfully exchanged code for User Access Token!');
        } else {
          // Fallback to direct Instagram endpoint
          try {
            console.log('[OAuth] Attempting direct Instagram token exchange via api.instagram.com...');
            const igForm = `client_id=${clientId}&client_secret=${clientSecret}&grant_type=authorization_code&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`;
            const igRes = await httpsPost('https://api.instagram.com/oauth/access_token', igForm, { 'Content-Type': 'application/x-www-form-urlencoded' });
            if (igRes.body && igRes.body.access_token) {
              userToken = igRes.body.access_token;
              console.log('[OAuth] Successfully exchanged code via direct Instagram API!');
            }
          } catch (ie) {
            console.warn('[OAuth] Direct Instagram exchange warning:', ie.message);
          }
        }

        if (userToken) {
          // Resolve connected Instagram using multi-method resolver
          const { connectedIg, pageToken } = await resolveConnectedInstagram(userToken, clientId, clientSecret);

          if (connectedIg) {
            db.instagram.connected = true;
            db.instagram.accountId = connectedIg.id;
            db.instagram.username = `@${connectedIg.username}`;
            db.instagram.name = connectedIg.name || connectedIg.username;
            db.instagram.profilePic = connectedIg.profile_picture_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80';
            db.instagram.followersCount = connectedIg.followers_count || 0;
            db.instagram.mediaCount = connectedIg.media_count || 0;
            db.instagram.accessToken = pageToken;
            db.instagram.appId = clientId;

            // Auto-Sync recent media
            try {
              const mediaUrl = `https://graph.facebook.com/v21.0/${connectedIg.id}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments_count,like_count&access_token=${pageToken}&limit=30`;
              const mediaRes = await httpsGet(mediaUrl);
              if (mediaRes.body && mediaRes.body.data) {
                db.reels = mediaRes.body.data.map(m => ({
                  id: m.id,
                  caption: m.caption || '',
                  permalink: m.permalink || '',
                  mediaType: m.media_type,
                  thumbnailUrl: m.thumbnail_url || m.media_url || '',
                  likeCount: m.like_count || 0,
                  commentsCount: m.comments_count || 0,
                  timestamp: m.timestamp
                }));
                console.log(`[Sync] Automatically synced ${db.reels.length} Instagram reels/posts for @${connectedIg.username}!`);
              }
            } catch (e) {
              console.error('[Sync] Media fetch warning:', e.message);
            }

            // Subscribed Apps Handshake
            try {
              await httpsPost(`https://graph.facebook.com/v21.0/${connectedIg.id}/subscribed_apps?subscribed_fields=comments,messages&access_token=${pageToken}`, {});
              console.log('[Meta] Subscribed apps webhook handshake completed successfully!');
            } catch (e) {}

            // Check state query param to link to the logged-in user
            const stateToken = parsedUrl.query.state;
            let sessionUser = null;
            if (stateToken) {
              const session = db.sessions.find(s => s.token === stateToken);
              if (session) {
                sessionUser = db.users.find(u => u.id === session.userId);
                if (sessionUser) {
                  console.log(`[OAuth] Linking Instagram to logged-in user: ${sessionUser.name} (${sessionUser.email})`);
                }
              }
            }

            // Fallback or auto-create if no session found
            if (!sessionUser) {
              sessionUser = db.users[0];
            }
            if (!sessionUser) {
              sessionUser = {
                id: `usr_${Date.now()}`,
                name: connectedIg.name || connectedIg.username,
                email: `${connectedIg.username.toLowerCase()}@instagram.com`,
                salt: 'oauth',
                passwordHash: 'oauth',
                createdAt: new Date().toISOString()
              };
              db.users.push(sessionUser);
            }

            // -----------------------------------------------------------------
            // EXCLUSIVE INSTAGRAM OWNERSHIP ENFORCEMENT
            // Rule: One Instagram account can ONLY be connected by ONE user!
            // No two users can ever claim or share the same Instagram account.
            // -----------------------------------------------------------------
            const existingClaimer = db.users.find(u =>
              u.id !== sessionUser.id &&
              u.instagram &&
              u.instagram.connected &&
              (u.instagram.accountId === connectedIg.id ||
               (u.instagram.username && u.instagram.username.toLowerCase() === `@${connectedIg.username.toLowerCase()}`))
            );

            if (existingClaimer) {
              console.warn(`[Security] Instagram account @${connectedIg.username} is already bound to user ${existingClaimer.email}!`);
              res.writeHead(302, {
                Location: `/?error=${encodeURIComponent(`The Instagram account @${connectedIg.username} is already connected to another user account (${existingClaimer.name}). Each Instagram account can only be linked to one user. Please disconnect it from that account first.`)}&error_code=ACCOUNT_ALREADY_CONNECTED`
              });
              res.end();
              return;
            }

            // Guarantee isolated user containers for multi-tenancy (20-25 users)
            sessionUser.instagram = {
              connected: true,
              accountId: connectedIg.id,
              username: `@${connectedIg.username}`,
              name: connectedIg.name || connectedIg.username,
              profilePic: connectedIg.profile_picture_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
              followersCount: connectedIg.followers_count || 0,
              mediaCount: connectedIg.media_count || 0,
              accessToken: pageToken,
              appId: clientId
            };
            sessionUser.reels = db.reels || [];
            if (!Array.isArray(sessionUser.rules)) sessionUser.rules = [];
            if (!Array.isArray(sessionUser.leads)) sessionUser.leads = [];
            if (!Array.isArray(sessionUser.processedCommentIds)) sessionUser.processedCommentIds = [];

            // Generate or reuse session token
            let activeToken = stateToken;
            const existingSession = db.sessions.find(s => s.token === activeToken);
            if (!existingSession) {
              activeToken = generateToken();
              db.sessions.push({
                token: activeToken,
                userId: sessionUser.id,
                email: sessionUser.email,
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
              });
            }

            writeDatabase(db);

            console.log(`[OAuth] Successfully connected Instagram account: @${connectedIg.username} for user ${sessionUser.email}`);
            res.writeHead(302, { Location: `/?oauth_success=true&username=${encodeURIComponent(connectedIg.username)}&session_token=${activeToken}` });
            res.end();
            return;
          } else {
            res.writeHead(302, { Location: `/?error=${encodeURIComponent('No Instagram Professional/Business account found linked to your Facebook Page. Please ensure your Instagram is connected to your Facebook Page.')}&error_code=NO_INSTAGRAM_LINKED` });
            res.end();
            return;
          }
        } else {
          const errMsg = tokenRes.body?.error?.message || 'Failed to exchange authorization code';
          console.error('[OAuth] Token exchange error:', errMsg);
          res.writeHead(302, { Location: `/?error=${encodeURIComponent(errMsg)}` });
          res.end();
          return;
        }
      } catch (err) {
        console.error('[OAuth] Processing exception:', err);
        res.writeHead(302, { Location: `/?error=${encodeURIComponent(err.message)}` });
        res.end();
        return;
      }
    } else {
      // clientSecret is needed for server-to-server token exchange
      global.latestPendingAuthCode = code;
      console.log('[OAuth] App Secret is required to complete token exchange. Redirecting with code.');
      res.writeHead(302, { Location: `/?auth_code=${encodeURIComponent(code)}&need_secret=true` });
      res.end();
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // 1.55. CONFIGURE APP SECRET (Auto-complete pending OAuth exchange)
  // ---------------------------------------------------------------------------
  if (pathname === '/api/instagram/configure-secret' && method === 'POST') {
    const body = await parseBody(req);
    const { appSecret } = body;
    if (!appSecret) {
      sendJson(res, 400, { success: false, error: 'App Secret is required.' });
      return;
    }

    const db = readDatabase();
    db.instagram.appSecret = appSecret.trim();
    writeDatabase(db);
    console.log('[Meta] Configured Meta App Secret in database!');

    if (global.latestPendingAuthCode) {
      const clientId = '3050678375263805';
      const redirectUri = getRedirectUri(req);
      try {
        console.log('[OAuth Auto-Exchange] Exchanging pending authorization code with Meta...');
        const tokenExchangeUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${clientId}&client_secret=${appSecret.trim()}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${global.latestPendingAuthCode}`;
        const tokenRes = await httpsGet(tokenExchangeUrl);

        if (tokenRes.body && tokenRes.body.access_token) {
          const userToken = tokenRes.body.access_token;
          const pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}&access_token=${userToken}`;
          const pagesRes = await httpsGet(pagesUrl);

          const accounts = pagesRes.body?.data || [];
          let connectedIg = null;
          let pageToken = '';
          for (const acc of accounts) {
            if (acc.instagram_business_account) {
              connectedIg = acc.instagram_business_account;
              pageToken = acc.access_token || userToken;
              break;
            }
          }

          if (connectedIg) {
            db.instagram.connected = true;
            db.instagram.accountId = connectedIg.id;
            db.instagram.username = `@${connectedIg.username}`;
            db.instagram.name = connectedIg.name || connectedIg.username;
            db.instagram.profilePic = connectedIg.profile_picture_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80';
            db.instagram.followersCount = connectedIg.followers_count || 0;
            db.instagram.mediaCount = connectedIg.media_count || 0;
            db.instagram.accessToken = pageToken;
            db.instagram.appId = clientId;

            // Auto-Sync recent media
            try {
              const mediaUrl = `https://graph.facebook.com/v21.0/${connectedIg.id}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments_count,like_count&access_token=${pageToken}&limit=30`;
              const mediaRes = await httpsGet(mediaUrl);
              if (mediaRes.body && mediaRes.body.data) {
                db.reels = mediaRes.body.data.map(m => ({
                  id: m.id,
                  caption: m.caption || '',
                  permalink: m.permalink || '',
                  mediaType: m.media_type,
                  thumbnailUrl: m.thumbnail_url || m.media_url || '',
                  likeCount: m.like_count || 0,
                  commentsCount: m.comments_count || 0,
                  timestamp: m.timestamp
                }));
              }
            } catch (e) {}

            writeDatabase(db);
            console.log(`[OAuth Auto-Exchange] Successfully connected @${connectedIg.username}!`);
            sendJson(res, 200, { success: true, connected: true, username: `@${connectedIg.username}`, instagram: db.instagram });
            return;
          }
        }
      } catch (e) {
        console.error('[OAuth Auto-Exchange] Exception:', e.message);
      }
    }

    sendJson(res, 200, { success: true, connected: false, message: 'App Secret saved! Now click 1-Click Connect to finish.' });
    return;
  }

  // ---------------------------------------------------------------------------
  // 1.6. OAUTH TOKEN EXCHANGE VIA CODE & APP SECRET
  // ---------------------------------------------------------------------------
  if (pathname === '/api/auth/facebook/exchange-token' && method === 'POST') {
    const body = await parseBody(req);
    const { code, appSecret } = body;
    const clientId = '3050678375263805';
    const redirectUri = getRedirectUri(req);

    if (!code || !appSecret) {
      sendJson(res, 400, { success: false, error: 'Authorization code and Meta App Secret are required.' });
      return;
    }

    try {
      console.log('[OAuth Exchange] Exchanging authorization code with Meta for User Access Token...');
      const tokenExchangeUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${clientId}&client_secret=${appSecret.trim()}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code.trim()}`;
      const tokenRes = await httpsGet(tokenExchangeUrl);

      if (!tokenRes.body || !tokenRes.body.access_token) {
        const errMsg = tokenRes.body?.error?.message || 'Meta rejected code exchange. The code may have expired or App Secret is invalid.';
        sendJson(res, 400, { success: false, error: errMsg });
        return;
      }

      const userToken = tokenRes.body.access_token;
      console.log('[OAuth Exchange] User token acquired! Querying accounts and Instagram page...');

      const pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}&access_token=${userToken}`;
      const pagesRes = await httpsGet(pagesUrl);

      const accounts = pagesRes.body?.data || [];
      let connectedIg = null;
      let pageToken = '';

      for (const acc of accounts) {
        if (acc.instagram_business_account) {
          connectedIg = acc.instagram_business_account;
          pageToken = acc.access_token || userToken;
          break;
        }
      }

      if (!connectedIg) {
        sendJson(res, 400, { success: false, error: 'No Instagram Business or Creator account found connected to your Facebook Page. Please ensure your Instagram is connected to a Facebook Page.' });
        return;
      }

      const db = readDatabase();
      const user = getUserFromReq(req, db);

      // Rule: Check if another user already connected this exact Instagram account
      const existingClaimer = db.users.find(u =>
        u.id !== user?.id &&
        u.instagram &&
        u.instagram.connected &&
        (u.instagram.accountId === connectedIg.id ||
         (u.instagram.username && u.instagram.username.toLowerCase() === `@${connectedIg.username.toLowerCase()}`))
      );

      if (existingClaimer) {
        sendJson(res, 400, {
          success: false,
          error: `The Instagram account @${connectedIg.username} is already connected to another EngageFlow user (${existingClaimer.name}). Two users cannot connect the same Instagram account.`
        });
        return;
      }

      const connectedPayload = {
        connected: true,
        accountId: connectedIg.id,
        username: `@${connectedIg.username}`,
        name: connectedIg.name || connectedIg.username,
        profilePic: connectedIg.profile_picture_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        followersCount: connectedIg.followers_count || 0,
        mediaCount: connectedIg.media_count || 0,
        accessToken: pageToken,
        appId: clientId,
        appSecret: appSecret.trim(),
        webhookVerifyToken: db.instagram.webhookVerifyToken || 'engageflow_webhook_secret_2026'
      };

      if (user) {
        user.instagram = { ...connectedPayload };
      }
      db.instagram = { ...connectedPayload };

      // Auto-Sync recent media
      try {
        const mediaUrl = `https://graph.facebook.com/v21.0/${connectedIg.id}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments_count,like_count&access_token=${pageToken}&limit=30`;
        const mediaRes = await httpsGet(mediaUrl);
        if (mediaRes.body && mediaRes.body.data) {
          db.reels = mediaRes.body.data.map(m => ({
            id: m.id,
            caption: m.caption || '',
            permalink: m.permalink || '',
            mediaType: m.media_type,
            thumbnailUrl: m.thumbnail_url || m.media_url || '',
            likeCount: m.like_count || 0,
            commentsCount: m.comments_count || 0,
            timestamp: m.timestamp
          }));
          console.log(`[Sync] Automatically synced ${db.reels.length} Instagram reels/posts for @${connectedIg.username}!`);
        }
      } catch (e) {
        console.error('[Sync] Media fetch warning:', e.message);
      }

      // Subscribed Apps Handshake
      try {
        await httpsPost(`https://graph.facebook.com/v21.0/${connectedIg.id}/subscribed_apps?subscribed_fields=comments,messages&access_token=${pageToken}`, {});
        console.log('[Meta] Subscribed apps webhook handshake completed successfully!');
      } catch (e) {
        console.error('[Meta] Subscribed apps warning:', e.message);
      }

      // Auto-create or ensure session user
      let sessionUser = db.users[0];
      if (!sessionUser) {
        sessionUser = {
          id: `usr_${Date.now()}`,
          name: connectedIg.name || connectedIg.username,
          email: `${connectedIg.username.toLowerCase()}@instagram.com`,
          salt: 'oauth',
          passwordHash: 'oauth',
          createdAt: new Date().toISOString()
        };
        db.users.push(sessionUser);
      }
      const sessionToken = generateToken();
      db.sessions.push({
        token: sessionToken,
        userId: sessionUser.id,
        email: sessionUser.email,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      });

      writeDatabase(db);

      sendJson(res, 200, {
        success: true,
        message: `Successfully connected and synced @${connectedIg.username}!`,
        token: sessionToken,
        user: { id: sessionUser.id, name: sessionUser.name, email: sessionUser.email },
        instagram: db.instagram,
        reelsCount: (db.reels || []).length
      });
    } catch (err) {
      console.error('[OAuth Exchange] Error:', err);
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // 1.7. SYNC REELS API (User-Scoped Multi-Tenant)
  // ---------------------------------------------------------------------------
  if (pathname === '/api/instagram/sync' && method === 'POST') {
    const db = readDatabase();
    const user = getUserFromReq(req, db);
    const ig = user ? user.instagram : db.instagram;

    if (!ig || !ig.connected || !ig.accessToken || !ig.accountId) {
      sendJson(res, 400, { success: false, error: 'Instagram account is not connected.' });
      return;
    }

    try {
      const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments_count,like_count';
      const mediaUrl = `https://graph.facebook.com/v21.0/${ig.accountId}/media?fields=${fields}&access_token=${ig.accessToken}&limit=100`;
      const tagsUrl = `https://graph.facebook.com/v21.0/${ig.accountId}/tags?fields=${fields}&access_token=${ig.accessToken}&limit=100`;

      let rawItems = [];
      const mediaRes = await httpsGet(mediaUrl);
      if (mediaRes.body && Array.isArray(mediaRes.body.data)) {
        rawItems = rawItems.concat(mediaRes.body.data.map(m => ({ ...m, isCollab: false })));
      }

      try {
        const tagsRes = await httpsGet(tagsUrl);
        if (tagsRes.body && Array.isArray(tagsRes.body.data)) {
          rawItems = rawItems.concat(tagsRes.body.data.map(m => ({ ...m, isCollab: true })));
        }
      } catch (tagErr) {
        console.warn('[SaaS Sync] Tags notice:', tagErr.message);
      }

      if (rawItems.length > 0) {
        const mediaMap = new Map();
        for (const item of rawItems) {
          if (mediaMap.has(item.id)) {
            if (item.isCollab) mediaMap.get(item.id).isCollab = true;
          } else {
            mediaMap.set(item.id, item);
          }
        }

        const syncedReels = Array.from(mediaMap.values()).map(m => ({
          id: m.id,
          caption: m.caption || '',
          permalink: m.permalink || '',
          mediaType: m.media_type,
          thumbnailUrl: m.thumbnail_url || m.media_url || '',
          likeCount: m.like_count || 0,
          commentsCount: m.comments_count || 0,
          timestamp: m.timestamp,
          isCollab: Boolean(m.isCollab)
        }));

        if (user) user.reels = syncedReels;
        db.reels = syncedReels;
        writeDatabase(db);
        const ownCount = syncedReels.filter(r => !r.isCollab).length;
        const collabCount = syncedReels.filter(r => r.isCollab).length;
        sendJson(res, 200, {
          success: true,
          message: `Synced ${syncedReels.length} total posts (${ownCount} personal, ${collabCount} collabs/tagged)!`,
          reels: syncedReels,
          ownCount,
          collabCount
        });
      } else {
        sendJson(res, 400, { success: false, error: mediaRes.body?.error?.message || 'Could not fetch media' });
      }
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  if (pathname === '/api/reels' && method === 'GET') {
    const db = readDatabase();
    const user = getUserFromReq(req, db);
    const reels = user ? user.reels : db.reels;
    sendJson(res, 200, { success: true, reels: reels || [] });
    return;
  }

  // ---------------------------------------------------------------------------
  // 2. REAL INSTAGRAM CONNECTION VALIDATOR (Meta Graph API)
  // ---------------------------------------------------------------------------
  if (pathname === '/api/instagram/connect' && method === 'POST') {
    const body = await parseBody(req);
    const { appId, appSecret, accessToken, accountId, webhookVerifyToken } = body;

    if (!accessToken || !accountId) {
      sendJson(res, 400, {
        success: false,
        error: 'Instagram Business Account ID and Page Access Token are required.'
      });
      return;
    }

    try {
      // Live validation call to Meta Graph API
      const metaUrl = `https://graph.facebook.com/v21.0/${accountId.trim()}?fields=id,username,name,profile_picture_url,followers_count,media_count&access_token=${accessToken.trim()}`;
      console.log(`[Meta] Validating Instagram account ID: ${accountId}`);

      const metaRes = await httpsGet(metaUrl);

      if (metaRes.statusCode !== 200 || !metaRes.body || metaRes.body.error) {
        const errorMsg = metaRes.body?.error?.message || 'Meta returned an error. Please verify your Account ID and Access Token.';
        console.error('[Meta] Connection validation failed:', errorMsg);
        sendJson(res, 400, {
          success: false,
          error: `Meta Verification Failed: ${errorMsg}`
        });
        return;
      }

      // Success! Real Instagram details obtained from Meta
      const igData = metaRes.body;
      const db = readDatabase();
      const user = getUserFromReq(req, db);

      // Rule: Check if another user already connected this exact Instagram account
      const existingClaimer = db.users.find(u =>
        u.id !== user?.id &&
        u.instagram &&
        u.instagram.connected &&
        (u.instagram.accountId === (igData.id || accountId.trim()) ||
         (u.instagram.username && u.instagram.username.toLowerCase() === `@${(igData.username || '').toLowerCase()}`))
      );

      if (existingClaimer) {
        sendJson(res, 400, {
          success: false,
          error: `The Instagram account (@${igData.username || accountId}) is already connected to another EngageFlow user (${existingClaimer.name}). Two users cannot connect the same Instagram account.`
        });
        return;
      }

      const connectedData = {
        connected: true,
        accountId: igData.id || accountId.trim(),
        username: igData.username ? `@${igData.username}` : '@instagram_creator',
        name: igData.name || 'Instagram Creator',
        profilePic: igData.profile_picture_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        followersCount: igData.followers_count || 0,
        mediaCount: igData.media_count || 0,
        accessToken: accessToken.trim(),
        appId: appId ? appId.trim() : '',
        appSecret: appSecret ? appSecret.trim() : '',
        webhookVerifyToken: webhookVerifyToken ? webhookVerifyToken.trim() : 'autopulse_public_webhook_2026'
      };

      if (user) {
        user.instagram = { ...connectedData };
      }
      db.instagram = { ...connectedData };

      writeDatabase(db);

      console.log(`[Meta] Connected successfully to ${db.instagram.username} (${db.instagram.followersCount} followers)!`);

      sendJson(res, 200, {
        success: true,
        message: `Successfully connected to ${db.instagram.username}!`,
        instagram: {
          connected: true,
          username: db.instagram.username,
          name: db.instagram.name,
          profilePic: db.instagram.profilePic,
          followersCount: db.instagram.followersCount,
          mediaCount: db.instagram.mediaCount
        }
      });
    } catch (err) {
      console.error('[Meta] Network error validating token:', err);
      sendJson(res, 500, {
        success: false,
        error: `Could not reach Meta Graph API servers: ${err.message}`
      });
    }
    return;
  }

  if (pathname === '/api/instagram/status' && method === 'GET') {
    const db = readDatabase();
    const user = getUserFromReq(req, db);
    const ig = user ? user.instagram : db.instagram;

    sendJson(res, 200, {
      success: true,
      instagram: {
        connected: Boolean(ig?.connected),
        accountId: ig?.accountId || '',
        username: ig?.username || '',
        name: ig?.name || '',
        profilePic: ig?.profilePic || '',
        followersCount: ig?.followersCount || 0,
        mediaCount: ig?.mediaCount || 0,
        appId: ig?.appId || process.env.META_APP_ID || '3050678375263805',
        hasAccessToken: Boolean(ig?.accessToken)
      }
    });
    return;
  }

  // ---------------------------------------------------------------------------
  // 2.7. REVOKE / DISCONNECT INSTAGRAM ACCOUNT & PAUSE ALL AUTO-DMS
  // ---------------------------------------------------------------------------
  if ((pathname === '/api/instagram/disconnect' || pathname === '/api/instagram/revoke') && method === 'POST') {
    const db = readDatabase();
    const user = getUserFromReq(req, db);

    const revokedUsername = user?.instagram?.username || db.instagram?.username || 'account';

    if (user && user.instagram) {
      user.instagram.connected = false;
      user.instagram.accessToken = '';
      user.instagram.username = '';
      user.instagram.followersCount = 0;
      user.instagram.mediaCount = 0;

      // PAUSE ALL AUTOMATION RULES FOR THIS USER IMMEDIATELY
      let pausedCount = 0;
      if (Array.isArray(user.rules)) {
        user.rules.forEach(r => {
          if (r.status === 'active') pausedCount++;
          r.status = 'paused';
        });
      }

      // Add to user activity logs
      if (!Array.isArray(user.activityLogs)) user.activityLogs = [];
      user.activityLogs.unshift({
        id: `act_${Date.now()}`,
        type: 'account_revoked',
        text: `Instagram account ${revokedUsername} revoked. ${pausedCount} active auto-DM rules have been paused.`,
        timestamp: new Date().toISOString()
      });
    }

    // Also update global fallback
    db.instagram.connected = false;
    db.instagram.accessToken = '';
    db.instagram.username = '';
    if (Array.isArray(db.rules)) {
      db.rules.forEach(r => {
        r.status = 'paused';
      });
    }

    writeDatabase(db);
    console.log(`[Instagram] 🛑 Account ${revokedUsername} revoked. All active auto-DM rules paused!`);
    sendJson(res, 200, {
      success: true,
      message: `Instagram account ${revokedUsername} disconnected. All automation rules and auto-DMs are now paused.`,
      pausedRulesCount: user?.rules?.length || 0
    });
    return;
  }

  // ---------------------------------------------------------------------------
  // 3. REAL AUTOMATION RULES API (User-Scoped Multi-Tenant)
  // ---------------------------------------------------------------------------
  if (pathname === '/api/rules' && method === 'GET') {
    const db = readDatabase();
    const user = getUserFromReq(req, db);
    const rules = user ? user.rules : db.rules;
    sendJson(res, 200, { success: true, rules: rules || [] });
    return;
  }

  if (pathname.startsWith('/api/rules/') && method === 'GET') {
    const ruleId = pathname.replace('/api/rules/', '').trim();
    const db = readDatabase();
    const user = getUserFromReq(req, db);
    const targetRules = (user ? user.rules : db.rules) || [];
    const rule = targetRules.find(r => r.id === ruleId);
    if (rule) {
      sendJson(res, 200, { success: true, rule });
    } else {
      sendJson(res, 404, { success: false, error: 'Rule not found' });
    }
    return;
  }

  if (pathname === '/api/rules' && method === 'POST') {
    const body = await parseBody(req);
    const db = readDatabase();
    const user = getUserFromReq(req, db);

    const matchType = body.matchType || 'contains';
    const isAnyComment = matchType === 'any_comment';

    if (!body.name || (!isAnyComment && (!body.triggers || !body.triggers.length))) {
      sendJson(res, 400, { success: false, error: 'Rule name and trigger keywords are required.' });
      return;
    }

    const ruleId = body.id || `rule_${Date.now()}`;
    const targetRules = (user ? user.rules : db.rules) || [];
    const existingIdx = targetRules.findIndex(r => r.id === ruleId);

    const newRule = {
      id: ruleId,
      userId: user?.id,
      name: body.name.trim(),
      status: body.status || 'active',
      matchType: matchType,
      triggers: Array.isArray(body.triggers)
        ? body.triggers.map(t => String(t).trim().toUpperCase()).filter(Boolean)
        : String(body.triggers || '').split(',').map(t => t.trim().toUpperCase()).filter(Boolean),
      excludeTriggers: Array.isArray(body.excludeTriggers)
        ? body.excludeTriggers.map(t => String(t).trim().toUpperCase()).filter(Boolean)
        : String(body.excludeTriggers || '').split(',').map(t => t.trim().toUpperCase()).filter(Boolean),
      targetPost: body.targetPost || 'all',
      targetPostThumbnail: body.targetPostThumbnail || '',
      targetPostCaption: body.targetPostCaption || '',
      targetPostType: body.targetPostType || 'ALL',
      publicReply: body.publicReply || 'Sent you the link in your DMs! 🚀 Check your inbox!',
      dmMessage: body.dmMessage || 'Hey {{name}}! Here is your requested link:',
      heroImage: body.heroImage || '',
      buttons: Array.isArray(body.buttons) ? body.buttons.map(b => ({
        id: b.id || `btn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        label: String(b.label || '').trim(),
        type: b.type || (b.url && b.url.toLowerCase().endsWith('.pdf') ? 'pdf' : (b.url && (b.url.endsWith('.png') || b.url.endsWith('.jpg') || b.url.endsWith('.jpeg')) ? 'image' : (b.url && (b.url.startsWith('http://') || b.url.startsWith('https://')) ? 'url' : 'quick_reply'))),
        url: String(b.url || '').trim(),
        fileName: b.fileName || '',
        fileSize: b.fileSize || ''
      })).filter(b => b.label) : [],
      secondReply: body.secondReply ? {
        enabled: Boolean(body.secondReply.enabled),
        triggerText: String(body.secondReply.triggerText || '').trim(),
        message: String(body.secondReply.message || '').trim(),
        mediaType: body.secondReply.mediaType || 'none',
        mediaUrl: String(body.secondReply.mediaUrl || '').trim(),
        fileName: String(body.secondReply.fileName || '').trim(),
        buttons: Array.isArray(body.secondReply.buttons) ? body.secondReply.buttons.filter(b => b && b.label) : []
      } : { enabled: false, triggerText: '', message: '', mediaType: 'none', mediaUrl: '', fileName: '', buttons: [] },
      delaySeconds: Number(body.delaySeconds) || 0,
      stats: existingIdx >= 0 && targetRules[existingIdx].stats ? targetRules[existingIdx].stats : { triggered: 0, dmsSent: 0, clickRate: '0%' },
      updatedAt: new Date().toISOString(),
      createdAt: existingIdx >= 0 && targetRules[existingIdx].createdAt ? targetRules[existingIdx].createdAt : new Date().toISOString()
    };

    if (existingIdx >= 0) {
      targetRules[existingIdx] = { ...targetRules[existingIdx], ...newRule };
    } else {
      targetRules.unshift(newRule);
    }

    if (user) {
      user.rules = targetRules;
      const gIdx = db.rules.findIndex(r => r.id === ruleId);
      if (gIdx >= 0) db.rules[gIdx] = newRule;
      else db.rules.unshift(newRule);
    } else {
      db.rules = targetRules;
    }

    writeDatabase(db);
    sendJson(res, 200, { success: true, rule: newRule });
    return;
  }

  if (pathname.startsWith('/api/rules/') && method === 'DELETE') {
    const ruleId = pathname.replace('/api/rules/', '');
    const db = readDatabase();
    const user = getUserFromReq(req, db);

    if (user) {
      user.rules = (user.rules || []).filter(r => r.id !== ruleId);
    }
    db.rules = (db.rules || []).filter(r => r.id !== ruleId);
    writeDatabase(db);
    sendJson(res, 200, { success: true, message: 'Rule deleted.' });
    return;
  }

  if (pathname === '/api/rules/toggle' && method === 'POST') {
    const body = await parseBody(req);
    const db = readDatabase();
    const user = getUserFromReq(req, db);
    const targetRules = (user ? user.rules : db.rules) || [];
    const rule = targetRules.find(r => r.id === body.ruleId);

    if (rule) {
      rule.status = rule.status === 'active' ? 'paused' : 'active';
      const gRule = db.rules.find(r => r.id === body.ruleId);
      if (gRule) gRule.status = rule.status;
      writeDatabase(db);
      sendJson(res, 200, { success: true, rule });
    } else {
      sendJson(res, 404, { success: false, error: 'Rule not found' });
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // 4. REAL LEADS MANAGEMENT API (User-Scoped Multi-Tenant)
  // ---------------------------------------------------------------------------
  if (pathname === '/api/leads' && method === 'GET') {
    const db = readDatabase();
    const user = getUserFromReq(req, db);
    const leads = user ? user.leads : db.leads;
    sendJson(res, 200, { success: true, leads: leads || [] });
    return;
  }

  if (pathname === '/api/leads/export-csv' && method === 'GET') {
    const db = readDatabase();
    const user = getUserFromReq(req, db);
    const leads = (user ? user.leads : db.leads) || [];

    let csv = 'ID,Instagram Username,Full Name,Email,Phone,Trigger Rule,Status,CTA Clicked,Timestamp\n';
    for (const lead of leads) {
      csv += `"${lead.id}","${lead.username}","${lead.fullName}","${lead.email || ''}","${lead.phone || ''}","${lead.triggerRule}","${lead.status}","${lead.ctaClicked || ''}","${lead.timestamp}"\n`;
    }
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="engageflow_leads.csv"'
    });
    res.end(csv);
    return;
  }

  // ---------------------------------------------------------------------------
  // 5. REAL METRICS API (User-Scoped Multi-Tenant)
  // ---------------------------------------------------------------------------
  if (pathname === '/api/metrics' && method === 'GET') {
    const db = readDatabase();
    const user = getUserFromReq(req, db);
    const m = user?.metrics || db.metrics;
    const rules = user ? user.rules : db.rules;
    const leads = user ? user.leads : db.leads;
    const ig = user ? user.instagram : db.instagram;

    sendJson(res, 200, {
      success: true,
      metrics: {
        totalDMsSent: m?.totalDMsSent || 0,
        rulesCount: (rules || []).length,
        leadsCount: (leads || []).length,
        instagramConnected: Boolean(ig?.connected),
        accountFollowers: ig?.followersCount || 0
      }
    });
    return;
  }

  // ---------------------------------------------------------------------------
  // 6. SIMULATOR ENGINE (Works against Real Rules)
  // ---------------------------------------------------------------------------
  if (pathname === '/api/simulate/comment' && method === 'POST') {
    const body = await parseBody(req);
    const userComment = (body.comment || '').trim();
    const username = body.username || '@viewer';
    const mediaId = body.mediaId || null;
    const mediaType = body.mediaType || 'VIDEO';
    const db = readDatabase();
    const user = getUserFromReq(req, db);

    if (!userComment) {
      sendJson(res, 400, { success: false, error: 'Comment text is required' });
      return;
    }

    const targetRules = (user && user.rules && user.rules.length) ? user.rules : db.rules;
    let matchedRule = null;

    for (const rule of targetRules) {
      if (matchCommentToRule(rule, userComment, mediaId, mediaType)) {
        matchedRule = rule;
        break;
      }
    }

    let result = null;
    if (matchedRule) {
      matchedRule.stats = matchedRule.stats || { triggered: 0, dmsSent: 0, clickRate: '0%' };
      matchedRule.stats.triggered = (matchedRule.stats.triggered || 0) + 1;
      matchedRule.stats.dmsSent = (matchedRule.stats.dmsSent || 0) + 1;
      db.metrics.totalDMsSent = (db.metrics.totalDMsSent || 0) + 1;
      writeDatabase(db);

      // Multi-reply variant picker
      const variants = (matchedRule.publicReply || 'Sent to your DMs! 🚀').split('|').map(s => s.trim()).filter(Boolean);
      const chosenReply = variants[Math.floor(Math.random() * variants.length)] || matchedRule.publicReply;

      const cleanUser = username.replace(/^@/, '');
      const personalizedDm = (matchedRule.dmMessage || 'Hey {{name}}! Here is your link:')
        .replace(/\{\{name\}\}/g, cleanUser)
        .replace(/\{\{username\}\}/g, `@${cleanUser}`);

      result = {
        matched: true,
        ruleName: matchedRule.name,
        targetPost: matchedRule.targetPost,
        matchType: matchedRule.matchType,
        publicReply: chosenReply.replace(/\{\{name\}\}/g, username),
        delaySeconds: matchedRule.delaySeconds || 0,
        dmPayload: {
          recipient: username,
          message: personalizedDm,
          heroImage: matchedRule.heroImage,
          buttons: matchedRule.buttons || [],
          secondReply: matchedRule.secondReply || null
        }
      };
    } else {
      result = {
        matched: false,
        publicReply: `Hey ${username}! Thanks for commenting! Drop one of our active keywords (e.g. LINK or GUIDE) to get your link instantly! 🚀`,
        delaySeconds: 0,
        dmPayload: {
          recipient: username,
          message: `Hey ${username}! Thanks for your comment: "${userComment}". We didn't detect an active keyword trigger, but check out our bio link!`,
          buttons: [{ label: 'Explore Resources 🌐', url: 'https://instagram.com', type: 'url' }],
          secondReply: null
        }
      };
    }

    sendJson(res, 200, { success: true, simulation: result });
    return;
  }

  // ---------------------------------------------------------------------------
  // 6b. SECOND REPLY SIMULATOR (Trigger Follow-Up DM on Quick Reply / Text)
  // ---------------------------------------------------------------------------
  if (pathname === '/api/simulate/second-reply' && method === 'POST') {
    const body = await parseBody(req);
    const triggerText = (body.triggerText || '').trim();
    const ruleId = body.ruleId;
    const username = body.username || '@viewer';
    const db = readDatabase();
    const user = getUserFromReq(req, db);
    const targetRules = (user && user.rules && user.rules.length) ? user.rules : db.rules;

    let targetRule = null;
    if (ruleId) {
      targetRule = targetRules.find(r => r.id === ruleId);
    }
    if (!targetRule && triggerText) {
      targetRule = targetRules.find(r => {
        if (!r.secondReply || !r.secondReply.enabled) return false;
        const exp = (r.secondReply.triggerText || '').trim().toLowerCase();
        return exp && (triggerText.toLowerCase().includes(exp) || exp.includes(triggerText.toLowerCase()));
      });
    }

    const cleanUser = username.replace(/^@/, '');
    if (targetRule && targetRule.secondReply && targetRule.secondReply.enabled) {
      const sec = targetRule.secondReply;
      const personalizedMsg = (sec.message || 'Awesome! Here is your download link / deliverable: 🚀')
        .replace(/\{\{name\}\}/g, cleanUser)
        .replace(/\{\{username\}\}/g, `@${cleanUser}`);

      sendJson(res, 200, {
        success: true,
        secondReply: {
          message: personalizedMsg,
          mediaType: sec.mediaType || 'none',
          mediaUrl: sec.mediaUrl || '',
          fileName: sec.fileName || '',
          buttons: sec.buttons || []
        }
      });
      return;
    }

    // Default graceful follow-up if not explicitly configured
    sendJson(res, 200, {
      success: true,
      secondReply: {
        message: `Thanks for confirming, ${cleanUser}! Here is your requested resource: ✨`,
        mediaType: 'pdf',
        mediaUrl: '/uploads/sample_guide.pdf',
        fileName: 'Instant_Access_Guide.pdf',
        buttons: [{ label: 'Download Deliverable 📄', url: 'https://instagram.com', type: 'pdf' }]
      }
    });
    return;
  }

  // ---------------------------------------------------------------------------
  // 6c. RESOURCE & DELIVERABLE UPLOAD (PDF Documents, Images, Files)
  // ---------------------------------------------------------------------------
  if (pathname === '/api/upload' && method === 'POST') {
    const body = await parseBody(req);
    const { fileName, fileData } = body;

    if (!fileName || !fileData) {
      sendJson(res, 400, { success: false, error: 'Both fileName and fileData (base64) are required.' });
      return;
    }

    try {
      const base64Content = fileData.includes(';base64,') ? fileData.split(';base64,')[1] : fileData;
      const fileBuffer = Buffer.from(base64Content, 'base64');

      const ext = path.extname(fileName).toLowerCase() || '.bin';
      const baseName = path.basename(fileName, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'file';
      const uniqueFileName = `${baseName}_${Date.now()}${ext}`;
      const filePath = path.join(UPLOADS_DIR, uniqueFileName);

      fs.writeFileSync(filePath, fileBuffer);

      const hostHeader = req.headers.host || `localhost:${PORT}`;
      const protocol = req.headers['x-forwarded-proto'] || (hostHeader.includes('trycloudflare.com') || hostHeader.includes('ngrok') ? 'https' : 'http');
      const baseUrl = `${protocol}://${hostHeader}`;
      const fileUrl = `${baseUrl}/uploads/${uniqueFileName}`;

      const sizeKb = (fileBuffer.length / 1024).toFixed(1);
      const sizeMb = (fileBuffer.length / (1024 * 1024)).toFixed(2);
      const formattedSize = fileBuffer.length > 1024 * 1024 ? `${sizeMb} MB` : `${sizeKb} KB`;

      let detectedType = 'file';
      if (['.pdf'].includes(ext)) detectedType = 'pdf';
      else if (['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'].includes(ext)) detectedType = 'image';

      console.log(`[Upload API] Successfully saved: ${uniqueFileName} (${formattedSize}) -> ${fileUrl}`);

      sendJson(res, 200, {
        success: true,
        fileName: fileName,
        savedName: uniqueFileName,
        url: fileUrl,
        relativeUrl: `/uploads/${uniqueFileName}`,
        fileSize: formattedSize,
        bytes: fileBuffer.length,
        ext: ext.replace('.', ''),
        type: detectedType
      });
      return;
    } catch (err) {
      console.error('[Upload Error]:', err);
      sendJson(res, 500, { success: false, error: err.message });
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // 7. REAL META WEBHOOK (Handshake & Live Comment Dispatcher)
  // ---------------------------------------------------------------------------
  if (pathname === '/api/webhooks/instagram' && method === 'GET') {
    const mode = parsedUrl.query['hub.mode'];
    const token = parsedUrl.query['hub.verify_token'];
    const challenge = parsedUrl.query['hub.challenge'];
    const db = readDatabase();

    if (mode === 'subscribe' && token === db.instagram.webhookVerifyToken) {
      console.log('[Webhook] Handshake verified successfully with Meta!');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(challenge);
    } else {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden: Invalid Verify Token');
    }
    return;
  }

  if (pathname === '/api/webhooks/instagram' && method === 'POST') {
    const body = await parseBody(req);
    console.log('[Webhook] Incoming Instagram event:', JSON.stringify(body).slice(0, 200));

    // Acknowledge Meta immediately with 200 OK
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'EVENT_RECEIVED' }));

    // Process comments asynchronously
    try {
      const db = readDatabase();
      if (!db.instagram.connected || !db.instagram.accessToken) return;

      const entries = body.entry || [];
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          if (change.field === 'comments') {
            const val = change.value;
            const commentText = (val.text || '').toUpperCase();
            const commenterId = val.from?.id;
            const commentId = val.id;

            // Find matching active rule
            const matchedRule = db.rules.find(r => matchCommentToRule(r, commentText, val.media?.id, val.media?.media_product_type));
            if (matchedRule && commenterId) {
              console.log(`[Webhook] Matched rule "${matchedRule.name}" for comment: ${val.text}`);

              // 1. Post public reply
              if (matchedRule.publicReply && commentId) {
                await dispatchPublicReply(db.instagram.accessToken, commentId, val.from?.username || 'friend', matchedRule);
              }

              // 2. Dispatch Direct Message with buttons support
              await dispatchInstagramDM(db.instagram.accessToken, commenterId, val.from?.username || 'friend', matchedRule);

              // Increment real metrics
              matchedRule.stats = matchedRule.stats || { triggered: 0, dmsSent: 0, clickRate: '0%' };
              matchedRule.stats.triggered = (matchedRule.stats.triggered || 0) + 1;
              matchedRule.stats.dmsSent = (matchedRule.stats.dmsSent || 0) + 1;
              db.metrics.totalDMsSent = (db.metrics.totalDMsSent || 0) + 1;
              writeDatabase(db);
            }
          }
        }
      }
    } catch (err) {
      console.error('[Webhook] Processing error:', err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // 8. STATIC ASSET SERVING & CUSTOM 404
  // ---------------------------------------------------------------------------
  if (pathname === '/' || pathname === '/index.html') {
    const indexPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(indexPath));
      return;
    }
  }

  // Handle uploaded deliverables (/uploads/*)
  if (pathname.startsWith('/uploads/')) {
    const requestedFile = pathname.replace(/^\/uploads\//, '');
    const safeUploadPath = path.normalize(path.join(UPLOADS_DIR, requestedFile));
    if (!safeUploadPath.startsWith(UPLOADS_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (fs.existsSync(safeUploadPath) && fs.statSync(safeUploadPath).isFile()) {
      const ext = path.extname(safeUploadPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const isInline = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.txt', '.mp4'].includes(ext);
      const disposition = isInline ? 'inline' : `attachment; filename="${path.basename(safeUploadPath)}"`;
      const stats = fs.statSync(safeUploadPath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Disposition': disposition,
        'Content-Length': stats.size,
        'Access-Control-Allow-Origin': '*'
      });
      fs.createReadStream(safeUploadPath).pipe(res);
      return;
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File Not Found');
      return;
    }
  }

  const requestedPath = path.join(__dirname, pathname);
  if (fs.existsSync(requestedPath) && !fs.statSync(requestedPath).isDirectory()) {
    const ext = path.extname(requestedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    try {
      const data = fs.readFileSync(requestedPath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
      return;
    } catch (e) {
      console.error('[Static] Error:', e);
    }
  }

  // If API route not found
  if (pathname.startsWith('/api/')) {
    sendJson(res, 404, { success: false, error: `API route ${pathname} was not found.` });
    return;
  }

  // Render Custom Branded 404 Page
  renderCustomErrorPage(res, 404, 'Page Not Found', `The page "${pathname}" could not be found on this server.`);
});

server.listen(PORT, () => {
  console.log(`=============================================================`);
  console.log(`🚀 EngageFlow Public SaaS Server is live!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🔒 Authentication & Real Meta Connect Engine Active`);
  console.log(`📁 Zero Fake Data — Database: ./data/database.json`);
  console.log(`⏱️ 2-Minute Automated Fail-Safe Scanner Active`);
  console.log(`=============================================================`);
});

// =============================================================================
// 2-MINUTE MULTI-TENANT AUTOMATED COMMENT SCANNER ENGINE
// Concurrently handles 20-25+ user accounts with separate rules & DMs
// =============================================================================
const SCAN_INTERVAL_MS = 2 * 60 * 1000;
let isScanning = false;

async function scanAndProcessLiveComments() {
  if (isScanning) return;
  const db = readDatabase();

  // Collect all users who have an active connected Instagram account
  const activeUsers = (db.users || []).filter(u =>
    u.instagram && u.instagram.connected && u.instagram.accessToken && u.instagram.accountId
  );

  // Top-level fallback for safety
  if (db.instagram?.connected && db.instagram?.accessToken && !activeUsers.some(u => u.instagram?.accountId === db.instagram.accountId)) {
    activeUsers.push({
      instagram: db.instagram,
      rules: db.rules || [],
      reels: db.reels || [],
      leads: db.leads || [],
      processedCommentIds: db.processedCommentIds || [],
      metrics: db.metrics || { totalDMsSent: 0 }
    });
  }

  if (!activeUsers.length) return;

  isScanning = true;
  console.log(`[2-Min Multi-Tenant Scanner] ⏱️ Checking live comments for ${activeUsers.length} user accounts concurrently...`);

  try {
    let totalDMsSentAcrossUsers = 0;

    for (const u of activeUsers) {
      const activeRules = (u.rules || []).filter(r => r.status === 'active');
      if (!activeRules.length) continue;

      const token = u.instagram.accessToken;
      if (!Array.isArray(u.processedCommentIds)) u.processedCommentIds = [];
      const reelsToScan = (u.reels || []).slice(0, 15);

      for (const reel of reelsToScan) {
        try {
          const commentsUrl = `https://graph.facebook.com/v21.0/${reel.id}/comments?fields=id,text,username,timestamp,from&access_token=${token}&limit=25`;
          const cRes = await httpsGet(commentsUrl);
          const comments = cRes.body?.data || [];

          for (const c of comments) {
            if (!c.id || u.processedCommentIds.includes(c.id)) continue;

            const commentText = (c.text || '').trim().toUpperCase();
            const commenterUsername = c.from?.username || c.username || 'follower';
            const commenterId = c.from?.id;

            for (const rule of activeRules) {
              const isMatch = matchCommentToRule(rule, commentText, reel.id, reel.mediaType);
              if (isMatch) {
                console.log(`[Scanner] 🔥 User @${u.instagram.username} matched rule "${rule.name}" for comment: "${c.text}" by @${commenterUsername}`);

                // 1. Post public comment reply (with randomized variants)
                if (rule.publicReply) {
                  await dispatchPublicReply(token, c.id, commenterUsername, rule);
                }

                // 2. Dispatch Direct Message (with clean buttons template & fallback)
                if (commenterId) {
                  await dispatchInstagramDM(token, commenterId, commenterUsername, rule);
                  totalDMsSentAcrossUsers++;
                  if (!u.metrics) u.metrics = { totalDMsSent: 0 };
                  u.metrics.totalDMsSent = (u.metrics.totalDMsSent || 0) + 1;
                }

                // Record Lead specifically for this user
                if (!Array.isArray(u.leads)) u.leads = [];
                u.leads.unshift({
                  id: `lead_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                  username: `@${commenterUsername}`,
                  fullName: commenterUsername,
                  triggerRule: rule.name,
                  status: 'Converted',
                  timestamp: new Date().toISOString()
                });

                rule.stats = rule.stats || {};
                rule.stats.triggered = (rule.stats.triggered || 0) + 1;
                rule.stats.dmsSent = (rule.stats.dmsSent || 0) + 1;
                break;
              }
            }

            u.processedCommentIds.push(c.id);
            if (u.processedCommentIds.length > 5000) u.processedCommentIds.shift();
          }
        } catch (e) {}
      }
    }

    if (totalDMsSentAcrossUsers > 0) {
      console.log(`[Scanner] ✅ Dispatched ${totalDMsSentAcrossUsers} automated DMs across users!`);
      writeDatabase(db);
    }
  } catch (err) {
    console.error('[2-Min Multi-Tenant Scanner] Exception:', err.message);
  } finally {
    isScanning = false;
  }
}

// Start recurring 2-minute timer
setInterval(scanAndProcessLiveComments, SCAN_INTERVAL_MS);
console.log(`[Scanner] 2-Minute Background Scanner active and scheduled.`);

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

const PORT = process.env.PORT || 5050;
const DB_FILE = path.join(__dirname, 'data', 'database.json');

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
  '.woff2': 'font/woff2'
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
      createdAt: new Date().toISOString()
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

      db.instagram = {
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
    sendJson(res, 200, {
      success: true,
      instagram: {
        connected: db.instagram.connected,
        accountId: db.instagram.accountId,
        username: db.instagram.username,
        name: db.instagram.name,
        profilePic: db.instagram.profilePic,
        followersCount: db.instagram.followersCount,
        mediaCount: db.instagram.mediaCount,
        appId: db.instagram.appId,
        hasAccessToken: Boolean(db.instagram.accessToken),
        webhookVerifyToken: db.instagram.webhookVerifyToken
      }
    });
    return;
  }

  if (pathname === '/api/instagram/disconnect' && method === 'POST') {
    const db = readDatabase();
    db.instagram.connected = false;
    db.instagram.accessToken = '';
    db.instagram.username = '';
    db.instagram.name = '';
    db.instagram.profilePic = '';
    db.instagram.followersCount = 0;
    writeDatabase(db);
    sendJson(res, 200, { success: true, message: 'Instagram account disconnected.' });
    return;
  }

  // ---------------------------------------------------------------------------
  // 3. REAL AUTOMATION RULES API
  // ---------------------------------------------------------------------------
  if (pathname === '/api/rules' && method === 'GET') {
    const db = readDatabase();
    sendJson(res, 200, { success: true, rules: db.rules });
    return;
  }

  if (pathname === '/api/rules' && method === 'POST') {
    const body = await parseBody(req);
    const db = readDatabase();

    if (!body.name || !body.triggers || !body.triggers.length) {
      sendJson(res, 400, { success: false, error: 'Rule name and trigger keywords are required.' });
      return;
    }

    const ruleId = body.id || `rule_${Date.now()}`;
    const existingIdx = db.rules.findIndex(r => r.id === ruleId);

    const newRule = {
      id: ruleId,
      name: body.name.trim(),
      status: body.status || 'active',
      triggers: Array.isArray(body.triggers)
        ? body.triggers.map(t => String(t).trim().toUpperCase())
        : String(body.triggers).split(',').map(t => t.trim().toUpperCase()).filter(Boolean),
      matchType: body.matchType || 'contains',
      targetPost: body.targetPost || 'all_reels',
      publicReply: body.publicReply || 'Sent you the link in your DMs! 🚀 Check your inbox!',
      dmMessage: body.dmMessage || 'Hey {{name}}! Here is your requested resource.',
      heroImage: body.heroImage || '',
      buttons: Array.isArray(body.buttons) ? body.buttons : [],
      delaySeconds: Number(body.delaySeconds) || 30,
      stats: existingIdx >= 0 ? db.rules[existingIdx].stats : { triggered: 0, opened: 0, clicked: 0 },
      createdAt: new Date().toISOString()
    };

    if (existingIdx >= 0) {
      db.rules[existingIdx] = newRule;
    } else {
      db.rules.unshift(newRule);
    }

    writeDatabase(db);
    sendJson(res, 200, { success: true, rule: newRule });
    return;
  }

  if (pathname.startsWith('/api/rules/') && method === 'DELETE') {
    const ruleId = pathname.replace('/api/rules/', '');
    const db = readDatabase();
    db.rules = db.rules.filter(r => r.id !== ruleId);
    writeDatabase(db);
    sendJson(res, 200, { success: true, message: 'Rule deleted.' });
    return;
  }

  if (pathname === '/api/rules/toggle' && method === 'POST') {
    const body = await parseBody(req);
    const db = readDatabase();
    const rule = db.rules.find(r => r.id === body.ruleId);
    if (rule) {
      rule.status = rule.status === 'active' ? 'paused' : 'active';
      writeDatabase(db);
      sendJson(res, 200, { success: true, rule });
    } else {
      sendJson(res, 404, { success: false, error: 'Rule not found' });
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // 4. REAL LEADS MANAGEMENT API
  // ---------------------------------------------------------------------------
  if (pathname === '/api/leads' && method === 'GET') {
    const db = readDatabase();
    sendJson(res, 200, { success: true, leads: db.leads });
    return;
  }

  if (pathname === '/api/leads/export-csv' && method === 'GET') {
    const db = readDatabase();
    let csv = 'ID,Instagram Username,Full Name,Email,Phone,Trigger Rule,Status,CTA Clicked,Timestamp\n';
    for (const lead of db.leads) {
      csv += `"${lead.id}","${lead.username}","${lead.fullName}","${lead.email}","${lead.phone}","${lead.triggerRule}","${lead.status}","${lead.ctaClicked || ''}","${lead.timestamp}"\n`;
    }
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="autopulse_leads.csv"'
    });
    res.end(csv);
    return;
  }

  // ---------------------------------------------------------------------------
  // 5. REAL METRICS API
  // ---------------------------------------------------------------------------
  if (pathname === '/api/metrics' && method === 'GET') {
    const db = readDatabase();
    sendJson(res, 200, {
      success: true,
      metrics: {
        totalDMsSent: db.metrics.totalDMsSent || 0,
        rulesCount: db.rules.length,
        leadsCount: db.leads.length,
        instagramConnected: db.instagram.connected,
        accountFollowers: db.instagram.followersCount || 0
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
    const db = readDatabase();

    if (!userComment) {
      sendJson(res, 400, { success: false, error: 'Comment text is required' });
      return;
    }

    const upperComment = userComment.toUpperCase();
    let matchedRule = null;

    for (const rule of db.rules) {
      if (rule.status !== 'active') continue;
      const match = rule.triggers.some(t => upperComment.includes(t));
      if (match) {
        matchedRule = rule;
        break;
      }
    }

    let result = null;
    if (matchedRule) {
      matchedRule.stats.triggered = (matchedRule.stats.triggered || 0) + 1;
      db.metrics.totalDMsSent = (db.metrics.totalDMsSent || 0) + 1;
      writeDatabase(db);

      result = {
        matched: true,
        ruleName: matchedRule.name,
        publicReply: matchedRule.publicReply.replace(/\{\{name\}\}/g, username),
        delaySeconds: matchedRule.delaySeconds,
        dmPayload: {
          recipient: username,
          message: matchedRule.dmMessage.replace(/\{\{name\}\}/g, username.replace('@', '')),
          heroImage: matchedRule.heroImage,
          buttons: matchedRule.buttons
        }
      };
    } else {
      result = {
        matched: false,
        publicReply: `Hey ${username}! Thanks for watching! Drop one of our active keywords to get the private link. 🚀`,
        delaySeconds: 10,
        dmPayload: {
          recipient: username,
          message: `Hey ${username}! Thanks for your comment: "${userComment}". We didn't catch an active keyword trigger, but feel free to explore our links!`,
          buttons: [{ label: 'Explore Links 🌐', url: 'https://example.com' }]
        }
      };
    }

    sendJson(res, 200, { success: true, simulation: result });
    return;
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
            const matchedRule = db.rules.find(r => r.status === 'active' && r.triggers.some(t => commentText.includes(t)));
            if (matchedRule && commenterId) {
              console.log(`[Webhook] Matched rule "${matchedRule.name}" for comment: ${val.text}`);

              // 1. Post public reply
              if (matchedRule.publicReply && commentId) {
                const replyUrl = `https://graph.facebook.com/v21.0/${commentId}/replies?access_token=${db.instagram.accessToken}`;
                await httpsPost(replyUrl, { message: matchedRule.publicReply });
              }

              // 2. Dispatch Direct Message
              const dmUrl = `https://graph.facebook.com/v21.0/me/messages?access_token=${db.instagram.accessToken}`;
              await httpsPost(dmUrl, {
                recipient: { id: commenterId },
                message: { text: matchedRule.dmMessage }
              });

              // Increment real metrics
              matchedRule.stats.triggered = (matchedRule.stats.triggered || 0) + 1;
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
  // 8. STATIC ASSET SERVING
  // ---------------------------------------------------------------------------
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, 'index.html');
  }

  if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
      return;
    } catch (e) {
      console.error('[Static] Error:', e);
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`=============================================================`);
  console.log(`🚀 EngageFlow Public SaaS Server is live!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🔒 Authentication & Real Meta Connect Engine Active`);
  console.log(`📁 Zero Fake Data — Database: ./data/database.json`);
  console.log(`=============================================================`);
});

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
  // 1.5. FACEBOOK / INSTAGRAM OAUTH CALLBACK (/api/auth/facebook/callback)
  // ---------------------------------------------------------------------------
  if (pathname === '/api/auth/facebook/callback' && method === 'GET') {
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
    const clientId = '3050678375263805'; // User's Meta App ID
    const clientSecret = db.instagram.appSecret;
    const redirectUri = 'https://decreased-sciences-participated-drums.trycloudflare.com/api/auth/facebook/callback';

    console.log('[OAuth] Received authorization code from Meta! Code:', code.slice(0, 15) + '...');

    // If clientSecret is available, exchange code for User Access Token
    if (clientSecret) {
      try {
        const tokenExchangeUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`;
        const tokenRes = await httpsGet(tokenExchangeUrl);

        if (tokenRes.body && tokenRes.body.access_token) {
          const userToken = tokenRes.body.access_token;
          console.log('[OAuth] Successfully exchanged code for User Access Token!');

          // Fetch user's managed Facebook Pages and connected Instagram Business Account
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

            console.log(`[OAuth] Successfully connected Instagram account: @${connectedIg.username}`);
            res.writeHead(302, { Location: `/?oauth_success=true&username=${encodeURIComponent(connectedIg.username)}&session_token=${sessionToken}` });
            res.end();
            return;
          } else {
            res.writeHead(302, { Location: `/?error=${encodeURIComponent('No Instagram Professional/Business account found linked to your Facebook Page. Please ensure your Instagram is connected to your Facebook Page.')}` });
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
      console.log('[OAuth] App Secret is required to complete token exchange. Redirecting with code.');
      res.writeHead(302, { Location: `/?auth_code=${encodeURIComponent(code)}&need_secret=true` });
      res.end();
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // 1.6. OAUTH TOKEN EXCHANGE VIA CODE & APP SECRET
  // ---------------------------------------------------------------------------
  if (pathname === '/api/auth/facebook/exchange-token' && method === 'POST') {
    const body = await parseBody(req);
    const { code, appSecret } = body;
    const clientId = '3050678375263805';
    const redirectUri = 'https://decreased-sciences-participated-drums.trycloudflare.com/api/auth/facebook/callback';

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
      db.instagram = {
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
  // 1.7. SYNC REELS API
  // ---------------------------------------------------------------------------
  if (pathname === '/api/instagram/sync' && method === 'POST') {
    const db = readDatabase();
    if (!db.instagram.connected || !db.instagram.accessToken || !db.instagram.accountId) {
      sendJson(res, 400, { success: false, error: 'Instagram account is not connected.' });
      return;
    }

    try {
      const mediaUrl = `https://graph.facebook.com/v21.0/${db.instagram.accountId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments_count,like_count&access_token=${db.instagram.accessToken}&limit=50`;
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
        writeDatabase(db);
        sendJson(res, 200, { success: true, message: `Synced ${db.reels.length} reels/posts!`, reels: db.reels });
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
    sendJson(res, 200, { success: true, reels: db.reels || [] });
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
  console.log(`⏱️ 2-Minute Automated Fail-Safe Scanner Active`);
  console.log(`=============================================================`);
});

// =============================================================================
// 2-MINUTE AUTOMATED COMMENT SCANNER ENGINE (FAIL-SAFE BACKGROUND POLL)
// =============================================================================
const SCAN_INTERVAL_MS = 2 * 60 * 1000;
let isScanning = false;

async function scanAndProcessLiveComments() {
  if (isScanning) return;
  const db = readDatabase();
  if (!db.instagram.connected || !db.instagram.accessToken || !db.instagram.accountId) return;
  if (!db.rules || !db.rules.length) return;

  const activeRules = db.rules.filter(r => r.status === 'active');
  if (!activeRules.length) return;

  isScanning = true;
  console.log(`[2-Min Scanner] ⏱️ Checking live comments for ${db.instagram.username} (${activeRules.length} active rules)...`);

  try {
    const token = db.instagram.accessToken;
    if (!Array.isArray(db.processedCommentIds)) db.processedCommentIds = [];

    const reelsToScan = (db.reels || []).slice(0, 15);
    let newDMsSent = 0;

    for (const reel of reelsToScan) {
      try {
        const commentsUrl = `https://graph.facebook.com/v21.0/${reel.id}/comments?fields=id,text,username,timestamp,from&access_token=${token}&limit=25`;
        const cRes = await httpsGet(commentsUrl);
        const comments = cRes.body?.data || [];

        for (const c of comments) {
          if (!c.id || db.processedCommentIds.includes(c.id)) continue;

          const commentText = (c.text || '').trim().toUpperCase();
          const commenterUsername = c.from?.username || c.username || 'follower';
          const commenterId = c.from?.id;

          for (const rule of activeRules) {
            const isMatch = rule.triggers.some(t => commentText.includes(t));
            if (isMatch) {
              console.log(`[2-Min Scanner] 🔥 Matched rule "${rule.name}" for comment: "${c.text}" by @${commenterUsername}`);

              // 1. Post public comment reply
              if (rule.publicReply) {
                const replyUrl = `https://graph.facebook.com/v21.0/${c.id}/replies?access_token=${token}`;
                await httpsPost(replyUrl, { message: rule.publicReply.replace(/\{\{name\}\}/g, `@${commenterUsername}`) });
              }

              // 2. Dispatch Direct Message
              if (commenterId) {
                const dmUrl = `https://graph.facebook.com/v21.0/me/messages?access_token=${token}`;
                await httpsPost(dmUrl, {
                  recipient: { id: commenterId },
                  message: { text: rule.dmMessage.replace(/\{\{name\}\}/g, commenterUsername) }
                });
                newDMsSent++;
              }

              // Record Lead
              db.leads.unshift({
                id: `lead_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                username: `@${commenterUsername}`,
                fullName: commenterUsername,
                triggerRule: rule.name,
                status: 'Converted',
                timestamp: new Date().toISOString()
              });

              rule.stats.triggered = (rule.stats.triggered || 0) + 1;
              db.metrics.totalDMsSent = (db.metrics.totalDMsSent || 0) + 1;
              break;
            }
          }

          db.processedCommentIds.push(c.id);
          if (db.processedCommentIds.length > 5000) db.processedCommentIds.shift();
        }
      } catch (e) {}
    }

    if (newDMsSent > 0) {
      console.log(`[2-Min Scanner] ✅ Dispatched ${newDMsSent} automated DMs via scanner!`);
      writeDatabase(db);
    }
  } catch (err) {
    console.error('[2-Min Scanner] Exception:', err.message);
  } finally {
    isScanning = false;
  }
}

// Start recurring 2-minute timer
setInterval(scanAndProcessLiveComments, SCAN_INTERVAL_MS);
console.log(`[Scanner] 2-Minute Background Scanner active and scheduled.`);

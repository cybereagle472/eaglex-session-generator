const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const express = require('express');
const fs = require('fs');
const path = require('path');
const P = require('pino');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());

let pairingCode = null;
let sessionId = null;
let status = 'idle';
let errorMsg = '';

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>CyberEagle Session Generator</title>
  <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@700;900&display=swap" rel="stylesheet"/>
  <style>
    :root {
      --green: #00ff88;
      --green-dim: rgba(0,255,136,0.15);
      --bg: #050a05;
      --card: #0a0f0a;
      --border: #1a2e1a;
      --text: #c8e6c9;
      --muted: #4a7a4a;
      --red: #ff3e3e;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Share Tech Mono', monospace;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background:
        repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,136,0.012) 2px, rgba(0,255,136,0.012) 4px),
        repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(0,255,136,0.012) 2px, rgba(0,255,136,0.012) 4px);
      pointer-events: none;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 40px 36px;
      width: 100%;
      max-width: 480px;
      position: relative;
      box-shadow: 0 0 60px rgba(0,255,136,0.04);
    }
    .card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--green), transparent);
    }
    .logo {
      font-family: 'Orbitron', sans-serif;
      font-size: 1.5em;
      font-weight: 900;
      color: var(--green);
      letter-spacing: 3px;
      text-align: center;
      margin-bottom: 4px;
      text-shadow: 0 0 20px rgba(0,255,136,0.4);
    }
    .subtitle {
      text-align: center;
      color: var(--muted);
      font-size: 0.72em;
      letter-spacing: 2px;
      margin-bottom: 36px;
      text-transform: uppercase;
    }
    .step { display: none; }
    .step.active { display: block; }
    label {
      display: block;
      font-size: 0.7em;
      color: var(--muted);
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    input {
      width: 100%;
      background: #0d150d;
      border: 1px solid var(--border);
      border-radius: 3px;
      color: var(--green);
      font-family: 'Share Tech Mono', monospace;
      font-size: 1.1em;
      padding: 14px 16px;
      outline: none;
      transition: border-color 0.2s;
      letter-spacing: 1px;
    }
    input:focus { border-color: var(--green); box-shadow: 0 0 0 1px var(--green-dim); }
    input::placeholder { color: var(--muted); }
    .hint { font-size: 0.67em; color: var(--muted); margin-top: 8px; line-height: 1.5; }
    button {
      width: 100%;
      margin-top: 20px;
      background: transparent;
      border: 1px solid var(--green);
      color: var(--green);
      font-family: 'Orbitron', sans-serif;
      font-size: 0.82em;
      font-weight: 700;
      letter-spacing: 3px;
      padding: 14px;
      border-radius: 3px;
      cursor: pointer;
      text-transform: uppercase;
      transition: background 0.2s;
    }
    button:hover { background: var(--green-dim); }
    button:disabled { opacity: 0.35; cursor: not-allowed; }
    .code-block {
      background: #0d150d;
      border: 1px solid var(--green);
      border-radius: 3px;
      padding: 28px 24px;
      text-align: center;
      margin: 20px 0;
      box-shadow: 0 0 30px rgba(0,255,136,0.06);
    }
    .code-label { font-size: 0.65em; color: var(--muted); letter-spacing: 3px; text-transform: uppercase; margin-bottom: 14px; }
    .code-value {
      font-family: 'Orbitron', sans-serif;
      font-size: 2.6em;
      font-weight: 900;
      color: var(--green);
      letter-spacing: 10px;
      text-shadow: 0 0 30px rgba(0,255,136,0.5);
    }
    .code-note { font-size: 0.65em; color: var(--muted); margin-top: 12px; }
    .ins-item { display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-start; }
    .ins-num { color: var(--green); font-family: 'Orbitron', sans-serif; font-size: 0.72em; font-weight: 700; min-width: 22px; margin-top: 2px; }
    .ins-text { font-size: 0.77em; color: var(--text); line-height: 1.5; }
    .ins-text strong { color: var(--green); }
    .status-bar {
      display: flex; align-items: center; gap: 10px;
      padding: 12px 16px;
      background: #0d150d;
      border: 1px solid var(--border);
      border-radius: 3px;
      margin-top: 20px;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .dot.green { background: var(--green); animation: pulse 1.4s infinite; }
    .dot.orange { background: #ffaa00; animation: pulse 1.4s infinite; }
    .dot.red { background: var(--red); }
    @keyframes pulse {
      0%,100% { opacity: 1; } 50% { opacity: 0.4; }
    }
    .status-text { font-size: 0.72em; color: var(--text); }
    .session-box {
      background: #0d150d;
      border: 1px solid var(--green);
      border-radius: 3px;
      padding: 16px;
      word-break: break-all;
      font-size: 0.62em;
      color: var(--green);
      line-height: 1.7;
      margin: 16px 0;
      max-height: 130px;
      overflow-y: auto;
    }
    .success-icon { font-size: 2.8em; text-align: center; margin-bottom: 10px; }
    .success-title {
      font-family: 'Orbitron', sans-serif;
      color: var(--green);
      text-align: center;
      font-size: 1em;
      letter-spacing: 3px;
      margin-bottom: 6px;
    }
    .success-sub { text-align: center; font-size: 0.7em; color: var(--muted); margin-bottom: 16px; }
    .error-box {
      background: rgba(255,62,62,0.07);
      border: 1px solid var(--red);
      border-radius: 3px;
      padding: 16px;
      font-size: 0.75em;
      color: var(--red);
      margin: 16px 0;
      text-align: center;
      line-height: 1.5;
    }
    hr { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
    .loader {
      display: inline-block;
      width: 14px; height: 14px;
      border: 2px solid var(--green-dim);
      border-top-color: var(--green);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      vertical-align: middle;
      margin-right: 8px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
<div class="card">
  <div class="logo">🦅 CYBEREAGLE</div>
  <div class="subtitle">Session Generator v2</div>

  <!-- Step 1: Phone Number -->
  <div class="step active" id="step-1">
    <label>WhatsApp Number</label>
    <input type="text" id="phone-input" placeholder="923441675739" maxlength="15"/>
    <p class="hint">With country code. No + or spaces.<br>Example: 923441675739 (Pakistan)</p>
    <button id="gen-btn" onclick="generate()">⚡ GENERATE PAIRING CODE</button>
  </div>

  <!-- Step 2: Connecting -->
  <div class="step" id="step-loading">
    <div class="status-bar">
      <div class="dot green"></div>
      <div class="status-text"><span class="loader"></span>Connecting to WhatsApp servers...</div>
    </div>
    <p class="hint" style="margin-top:14px;text-align:center">This takes 5–10 seconds. Please wait.</p>
  </div>

  <!-- Step 3: Show Code -->
  <div class="step" id="step-2">
    <div class="code-block">
      <div class="code-label">Enter this code in WhatsApp</div>
      <div class="code-value" id="pairing-code">----</div>
      <div class="code-note">⏱ Valid for ~60 seconds</div>
    </div>
    <div class="ins-item"><div class="ins-num">01</div><div class="ins-text">Open <strong>WhatsApp</strong> on your phone</div></div>
    <div class="ins-item"><div class="ins-num">02</div><div class="ins-text">Tap <strong>⋮ three dots</strong> → <strong>Linked Devices</strong></div></div>
    <div class="ins-item"><div class="ins-num">03</div><div class="ins-text">Tap <strong>Link a Device</strong> → <strong>"Link with phone number instead"</strong></div></div>
    <div class="ins-item"><div class="ins-num">04</div><div class="ins-text">Type the <strong>8-digit code</strong> above and confirm</div></div>
    <div class="status-bar">
      <div class="dot orange"></div>
      <div class="status-text" id="wait-text">Waiting for you to enter the code...</div>
    </div>
  </div>

  <!-- Step 4: Success -->
  <div class="step" id="step-3">
    <div class="success-icon">✅</div>
    <div class="success-title">SESSION READY!</div>
    <div class="success-sub">Copy this and paste into Render → SESSION_ID</div>
    <label>SESSION_ID</label>
    <div class="session-box" id="session-display"></div>
    <button onclick="copySession()" id="copy-btn">📋 COPY SESSION_ID</button>
    <hr/>
    <p class="hint" style="text-align:center">Go to Render → your bot → Environment → SESSION_ID → paste → redeploy</p>
  </div>

  <!-- Error -->
  <div class="step" id="step-error">
    <div class="error-box" id="err-msg">Something went wrong.</div>
    <button onclick="location.reload()">↺ TRY AGAIN</button>
  </div>
</div>

<script>
  let poll = null;

  function show(id) {
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  async function generate() {
    const raw = document.getElementById('phone-input').value.trim().replace(/\D/g,'');
    if (!raw || raw.length < 10) { alert('Enter a valid phone number with country code'); return; }

    const btn = document.getElementById('gen-btn');
    btn.disabled = true;
    show('step-loading');

    try {
      const res = await fetch('/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: raw })
      });
      const data = await res.json();

      if (data.success) {
        document.getElementById('pairing-code').textContent = data.code;
        show('step-2');
        startPoll();
      } else {
        document.getElementById('err-msg').textContent = '❌ ' + (data.error || 'Failed to generate code. Try again.');
        show('step-error');
      }
    } catch(e) {
      document.getElementById('err-msg').textContent = '❌ Network error: ' + e.message;
      show('step-error');
    }
  }

  function startPoll() {
    poll = setInterval(async () => {
      try {
        const r = await fetch('/status');
        const d = await r.json();
        if (d.status === 'connected' && d.sessionId) {
          clearInterval(poll);
          document.getElementById('session-display').textContent = d.sessionId;
          show('step-3');
        } else if (d.status === 'scanning') {
          document.getElementById('wait-text').textContent = '🔄 Code accepted! Finishing connection...';
        } else if (d.status === 'error') {
          clearInterval(poll);
          document.getElementById('err-msg').textContent = '❌ ' + (d.message || 'Connection failed.');
          show('step-error');
        }
      } catch(e) {}
    }, 2000);
  }

  function copySession() {
    const t = document.getElementById('session-display').textContent;
    navigator.clipboard.writeText(t).then(() => {
      const b = document.getElementById('copy-btn');
      b.textContent = '✅ COPIED!';
      setTimeout(() => b.textContent = '📋 COPY SESSION_ID', 3000);
    });
  }
</script>
</body>
</html>`);
});

// ─── Generate endpoint ───────────────────────────────────────────────────────
app.post('/generate', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.json({ success: false, error: 'Phone number is required' });

  try {
    const code = await startSession(phone);
    res.json({ success: true, code });
  } catch (e) {
    console.error('Generate error:', e);
    res.json({ success: false, error: e.message });
  }
});

// ─── Status endpoint ─────────────────────────────────────────────────────────
app.get('/status', (req, res) => {
  res.json({ status, sessionId, message: errorMsg });
});

// ─── Core session logic ──────────────────────────────────────────────────────
async function startSession(phoneNumber) {
  const AUTH_DIR = './session_temp';

  // Always start fresh
  if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive: true, force: true });

  pairingCode = null;
  sessionId = null;
  status = 'connecting';
  errorMsg = '';

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' }))
    },
    // FIX 3: realistic modern Chrome version — old version gets silently rejected
    browser: ['CyberEagle', 'Chrome', '120.0.0'],
    // FIX 2: keeps WebSocket alive during slow post-pairing sync
    keepAliveIntervalMs: 10_000,
    // prevents query timeouts during long initial sync
    defaultQueryTimeoutMs: undefined,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    // FIX 1: CRITICAL — without this WhatsApp hangs forever on "Logging in..."
    // It needs this callback to complete message sync after pairing
    getMessage: async () => {
      return { conversation: '' };
    },
  });

  // ── THE KEY FIX: request pairing code INSIDE connection.update ──
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // When socket is open and not yet registered → request pairing code
    if (qr && !sock.authState.creds.registered && !pairingCode) {
      try {
        console.log('📱 Requesting pairing code for:', phoneNumber);
        const code = await sock.requestPairingCode(phoneNumber);
        pairingCode = code?.match(/.{1,4}/g)?.join('-') || code;
        status = 'code_ready';
        console.log('✅ Pairing code:', pairingCode);
      } catch (err) {
        console.error('Pairing code error:', err.message);
        status = 'error';
        errorMsg = 'Failed to get pairing code: ' + err.message;
      }
    }

    if (connection === 'connecting') {
      console.log('🔗 Connecting to WhatsApp...');
      if (pairingCode) status = 'scanning';
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp connected!');
      status = 'connected';

      // Give it a moment to fully save creds
      await new Promise(r => setTimeout(r, 3000));

      const credsPath = path.join(AUTH_DIR, 'creds.json');
      if (fs.existsSync(credsPath)) {
        const credsRaw = fs.readFileSync(credsPath, 'utf8');
        const b64 = Buffer.from(credsRaw).toString('base64');
        sessionId = 'CYBEREAGLE~' + b64;
        console.log('🎉 SESSION_ID generated successfully!');
      } else {
        status = 'error';
        errorMsg = 'creds.json not found after connection.';
      }
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log('❌ Connection closed. Code:', code);

      if (code === DisconnectReason.loggedOut) {
        status = 'error';
        errorMsg = 'Logged out. Please try again.';
      } else if (!sessionId) {
        // Retry only if we haven't gotten the session yet
        status = 'error';
        errorMsg = 'Connection closed before session was captured. Try again.';
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Wait until pairing code is available (max 20 seconds)
  let waited = 0;
  while (!pairingCode && status !== 'error' && waited < 20000) {
    await new Promise(r => setTimeout(r, 500));
    waited += 500;
  }

  if (!pairingCode) {
    throw new Error('Timed out waiting for pairing code. Check your internet and try again.');
  }

  return pairingCode;
}

app.listen(PORT, () => {
  console.log(`🌐 CyberEagle Session Generator running on port ${PORT}`);
});

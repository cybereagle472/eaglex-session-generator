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
app.use(express.urlencoded({ extended: true }));

let pairingCode = null;
let sessionId = null;
let status = 'idle'; // idle | waiting_code | code_ready | scanning | connected | error
let errorMsg = '';
let sock = null;

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
      --green-dim: #00ff8844;
      --red: #ff3e3e;
      --bg: #050a05;
      --card: #0a0f0a;
      --border: #1a2e1a;
      --text: #c8e6c9;
      --muted: #4a7a4a;
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
      position: relative;
      overflow-x: hidden;
    }
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background: 
        repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,136,0.015) 2px, rgba(0,255,136,0.015) 4px),
        repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(0,255,136,0.015) 2px, rgba(0,255,136,0.015) 4px);
      pointer-events: none;
      z-index: 0;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 40px 36px;
      width: 100%;
      max-width: 480px;
      position: relative;
      z-index: 1;
      box-shadow: 0 0 60px rgba(0,255,136,0.05), inset 0 1px 0 rgba(0,255,136,0.1);
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
      text-shadow: 0 0 20px rgba(0,255,136,0.5);
    }
    .subtitle {
      text-align: center;
      color: var(--muted);
      font-size: 0.75em;
      letter-spacing: 2px;
      margin-bottom: 36px;
      text-transform: uppercase;
    }
    .step {
      display: none;
    }
    .step.active { display: block; }

    label {
      display: block;
      font-size: 0.72em;
      color: var(--muted);
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    input[type="text"] {
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
    input[type="text"]:focus {
      border-color: var(--green);
      box-shadow: 0 0 0 1px var(--green-dim);
    }
    input[type="text"]::placeholder { color: var(--muted); }
    .hint {
      font-size: 0.68em;
      color: var(--muted);
      margin-top: 8px;
      letter-spacing: 0.5px;
    }
    button {
      width: 100%;
      margin-top: 20px;
      background: transparent;
      border: 1px solid var(--green);
      color: var(--green);
      font-family: 'Orbitron', sans-serif;
      font-size: 0.85em;
      font-weight: 700;
      letter-spacing: 3px;
      padding: 14px;
      border-radius: 3px;
      cursor: pointer;
      text-transform: uppercase;
      transition: all 0.2s;
      position: relative;
      overflow: hidden;
    }
    button::before {
      content: '';
      position: absolute;
      inset: 0;
      background: var(--green);
      opacity: 0;
      transition: opacity 0.2s;
    }
    button:hover::before { opacity: 0.08; }
    button:active::before { opacity: 0.15; }
    button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    /* Pairing Code Display */
    .code-block {
      background: #0d150d;
      border: 1px solid var(--green);
      border-radius: 3px;
      padding: 24px;
      text-align: center;
      margin: 20px 0;
      box-shadow: 0 0 30px rgba(0,255,136,0.08);
    }
    .code-label {
      font-size: 0.65em;
      color: var(--muted);
      letter-spacing: 3px;
      text-transform: uppercase;
      margin-bottom: 12px;
    }
    .code-value {
      font-family: 'Orbitron', sans-serif;
      font-size: 2.4em;
      font-weight: 900;
      color: var(--green);
      letter-spacing: 8px;
      text-shadow: 0 0 30px rgba(0,255,136,0.6);
    }
    .code-expires {
      font-size: 0.65em;
      color: var(--muted);
      margin-top: 10px;
      letter-spacing: 1px;
    }

    /* Instructions */
    .instructions {
      margin: 20px 0;
    }
    .ins-item {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      margin-bottom: 12px;
    }
    .ins-num {
      color: var(--green);
      font-family: 'Orbitron', sans-serif;
      font-size: 0.75em;
      font-weight: 700;
      min-width: 20px;
      margin-top: 1px;
    }
    .ins-text {
      font-size: 0.78em;
      color: var(--text);
      line-height: 1.5;
      letter-spacing: 0.3px;
    }
    .ins-text strong { color: var(--green); }

    /* Status */
    .status-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 16px 0;
      padding: 12px 16px;
      background: #0d150d;
      border-radius: 3px;
      border: 1px solid var(--border);
    }
    .dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--green);
      flex-shrink: 0;
      animation: pulse 1.4s infinite;
    }
    .dot.orange { background: #ffaa00; }
    .dot.red { background: var(--red); animation: none; }
    @keyframes pulse {
      0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(0,255,136,0.4); }
      50% { opacity: 0.6; box-shadow: 0 0 0 6px rgba(0,255,136,0); }
    }
    .status-text {
      font-size: 0.73em;
      color: var(--text);
      letter-spacing: 0.5px;
    }

    /* Session ID */
    .session-box {
      background: #0d150d;
      border: 1px solid var(--green);
      border-radius: 3px;
      padding: 16px;
      word-break: break-all;
      font-size: 0.65em;
      color: var(--green);
      line-height: 1.6;
      letter-spacing: 0.3px;
      margin: 16px 0;
      max-height: 120px;
      overflow-y: auto;
    }
    .copy-btn {
      margin-top: 0;
    }
    .copy-btn.copied {
      border-color: var(--green);
      color: var(--green);
    }
    .success-icon {
      font-size: 3em;
      text-align: center;
      margin-bottom: 12px;
    }
    .success-title {
      font-family: 'Orbitron', sans-serif;
      color: var(--green);
      text-align: center;
      font-size: 1em;
      letter-spacing: 3px;
      margin-bottom: 8px;
    }
    .success-sub {
      text-align: center;
      font-size: 0.72em;
      color: var(--muted);
      margin-bottom: 16px;
      letter-spacing: 0.5px;
    }
    .error-box {
      background: rgba(255,62,62,0.08);
      border: 1px solid var(--red);
      border-radius: 3px;
      padding: 14px;
      font-size: 0.75em;
      color: var(--red);
      margin: 16px 0;
      text-align: center;
    }
    .divider {
      border: none;
      border-top: 1px solid var(--border);
      margin: 24px 0;
    }
  </style>
</head>
<body>
<div class="card">
  <div class="logo">🦅 CYBEREAGLE</div>
  <div class="subtitle">Session Generator</div>

  <!-- STEP 1: Enter Phone Number -->
  <div class="step active" id="step-1">
    <label>Your WhatsApp Number</label>
    <input type="text" id="phone-input" placeholder="923441675739" maxlength="20"/>
    <p class="hint">Enter with country code, no + or spaces. Example: 923441675739</p>
    <button id="get-code-btn" onclick="getCode()">GENERATE PAIRING CODE</button>
  </div>

  <!-- STEP 2: Show Pairing Code -->
  <div class="step" id="step-2">
    <div class="code-block">
      <div class="code-label">Your Pairing Code</div>
      <div class="code-value" id="pairing-code">--------</div>
      <div class="code-expires">⏱ Expires in ~60 seconds — act fast!</div>
    </div>

    <div class="instructions">
      <div class="ins-item">
        <div class="ins-num">01</div>
        <div class="ins-text">Open <strong>WhatsApp</strong> on your phone</div>
      </div>
      <div class="ins-item">
        <div class="ins-num">02</div>
        <div class="ins-text">Tap <strong>three dots (⋮)</strong> → <strong>Linked Devices</strong></div>
      </div>
      <div class="ins-item">
        <div class="ins-num">03</div>
        <div class="ins-text">Tap <strong>Link a Device</strong> → <strong>Link with phone number instead</strong></div>
      </div>
      <div class="ins-item">
        <div class="ins-num">04</div>
        <div class="ins-text">Enter the <strong>8-digit code</strong> shown above</div>
      </div>
    </div>

    <div class="status-bar">
      <div class="dot orange" id="status-dot"></div>
      <div class="status-text" id="status-text">Waiting for you to enter the code in WhatsApp...</div>
    </div>
  </div>

  <!-- STEP 3: Success -->
  <div class="step" id="step-3">
    <div class="success-icon">✅</div>
    <div class="success-title">CONNECTED!</div>
    <div class="success-sub">Your SESSION_ID is ready. Copy it and paste into Render.</div>

    <label>SESSION_ID</label>
    <div class="session-box" id="session-display"></div>

    <button class="copy-btn" id="copy-btn" onclick="copySession()">📋 COPY SESSION_ID</button>

    <hr class="divider"/>
    <p class="hint" style="text-align:center">Paste this into Render → Environment → SESSION_ID</p>
  </div>

  <!-- ERROR -->
  <div class="step" id="step-error">
    <div class="error-box" id="error-msg">Something went wrong.</div>
    <button onclick="location.reload()">↺ TRY AGAIN</button>
  </div>
</div>

<script>
  let polling = null;

  function showStep(n) {
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.getElementById('step-' + n).classList.add('active');
  }

  async function getCode() {
    const phone = document.getElementById('phone-input').value.trim().replace(/\D/g, '');
    if (!phone || phone.length < 10) {
      alert('Enter a valid phone number with country code');
      return;
    }
    const btn = document.getElementById('get-code-btn');
    btn.disabled = true;
    btn.textContent = 'GENERATING...';

    try {
      const res = await fetch('/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById('pairing-code').textContent = data.code;
        showStep(2);
        startPolling();
      } else {
        alert(data.error || 'Failed to generate code');
        btn.disabled = false;
        btn.textContent = 'GENERATE PAIRING CODE';
      }
    } catch (e) {
      alert('Network error. Try again.');
      btn.disabled = false;
      btn.textContent = 'GENERATE PAIRING CODE';
    }
  }

  function startPolling() {
    polling = setInterval(async () => {
      try {
        const res = await fetch('/status');
        const data = await res.json();

        if (data.status === 'connected' && data.sessionId) {
          clearInterval(polling);
          document.getElementById('session-display').textContent = data.sessionId;
          showStep(3);
        } else if (data.status === 'error') {
          clearInterval(polling);
          document.getElementById('error-msg').textContent = data.message || 'Connection failed.';
          showStep('error');
        } else if (data.status === 'scanning') {
          document.getElementById('status-text').textContent = 'Code entered! Connecting to WhatsApp...';
          document.getElementById('status-dot').className = 'dot';
        }
      } catch (e) {}
    }, 2000);
  }

  function copySession() {
    const text = document.getElementById('session-display').textContent;
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('copy-btn');
      btn.textContent = '✅ COPIED!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = '📋 COPY SESSION_ID';
        btn.classList.remove('copied');
      }, 3000);
    });
  }
</script>
</body>
</html>`);
});

// Generate pairing code endpoint
app.post('/generate', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.json({ success: false, error: 'Phone number required' });

    // Clean old session
    const AUTH_DIR = './session_temp';
    if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive: true, force: true });

    await startSession(phone);

    // Wait for pairing code (max 15s)
    let waited = 0;
    while (!pairingCode && waited < 15000) {
      await new Promise(r => setTimeout(r, 500));
      waited += 500;
    }

    if (!pairingCode) return res.json({ success: false, error: 'Timeout generating code. Try again.' });

    res.json({ success: true, code: pairingCode });
  } catch (e) {
    console.error(e);
    res.json({ success: false, error: e.message });
  }
});

// Status polling endpoint
app.get('/status', (req, res) => {
  res.json({ status, sessionId, message: errorMsg });
});

async function startSession(phoneNumber) {
  const AUTH_DIR = './session_temp';
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  // Reset state
  pairingCode = null;
  sessionId = null;
  status = 'waiting_code';
  errorMsg = '';

  sock = makeWASocket({
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' }))
    },
    version,
    browser: ['CyberEagle', 'Chrome', '20.0.0']
  });

  // Request pairing code
  if (!sock.authState.creds.registered) {
    await new Promise(r => setTimeout(r, 2000));
    const code = await sock.requestPairingCode(phoneNumber);
    pairingCode = code?.match(/.{1,4}/g)?.join('-') || code;
    console.log('📱 Pairing Code:', pairingCode);
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      status = 'connected';
      console.log('✅ Connected to WhatsApp!');

      await new Promise(r => setTimeout(r, 3000));

      const credsPath = path.join(AUTH_DIR, 'creds.json');
      if (fs.existsSync(credsPath)) {
        const credsData = fs.readFileSync(credsPath, 'utf8');
        const base64 = Buffer.from(credsData).toString('base64');
        sessionId = 'CYBEREAGLE~' + base64;
        console.log('🎉 SESSION_ID ready!');
      }
    }

    if (connection === 'connecting') {
      status = 'scanning';
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        status = 'error';
        errorMsg = 'Session logged out.';
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

app.listen(PORT, () => {
  console.log(`🌐 CyberEagle Session Generator → http://localhost:${PORT}`);
});

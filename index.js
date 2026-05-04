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
let currentPhone = null;

// ── HTML PAGE ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>CyberEagle Session Generator</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:monospace;background:#050a05;color:#c8e6c9;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{background:#0a0f0a;border:1px solid #1a2e1a;border-radius:6px;padding:36px;width:100%;max-width:460px;position:relative}
    .card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#00ff88,transparent)}
    h1{color:#00ff88;font-size:1.4em;letter-spacing:3px;text-align:center;margin-bottom:4px}
    .sub{text-align:center;color:#4a7a4a;font-size:.72em;letter-spacing:2px;margin-bottom:30px}
    .step{display:none}.step.active{display:block}
    label{font-size:.7em;color:#4a7a4a;letter-spacing:2px;text-transform:uppercase;display:block;margin-bottom:8px}
    input{width:100%;background:#0d150d;border:1px solid #1a2e1a;border-radius:3px;color:#00ff88;font-family:monospace;font-size:1.1em;padding:13px 15px;outline:none}
    input:focus{border-color:#00ff88}
    input::placeholder{color:#4a7a4a}
    .hint{font-size:.67em;color:#4a7a4a;margin-top:8px;line-height:1.5}
    button{width:100%;margin-top:18px;background:transparent;border:1px solid #00ff88;color:#00ff88;font-family:monospace;font-size:.9em;letter-spacing:2px;padding:13px;border-radius:3px;cursor:pointer}
    button:hover{background:rgba(0,255,136,.08)}
    button:disabled{opacity:.3;cursor:not-allowed}
    .code-box{background:#0d150d;border:1px solid #00ff88;border-radius:3px;padding:24px;text-align:center;margin:20px 0}
    .code{font-size:2.8em;font-weight:900;color:#00ff88;letter-spacing:10px;text-shadow:0 0 20px rgba(0,255,136,.5)}
    .code-note{font-size:.65em;color:#4a7a4a;margin-top:10px}
    .ins{margin:16px 0}
    .ins-row{display:flex;gap:12px;margin-bottom:10px;align-items:flex-start}
    .ins-n{color:#00ff88;font-size:.75em;min-width:20px;margin-top:1px}
    .ins-t{font-size:.77em;line-height:1.5}
    .ins-t b{color:#00ff88}
    .sbar{display:flex;align-items:center;gap:10px;padding:12px 15px;background:#0d150d;border:1px solid #1a2e1a;border-radius:3px;margin-top:16px}
    .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
    .dot.g{background:#00ff88;animation:pulse 1.2s infinite}
    .dot.o{background:#ffaa00;animation:pulse 1.2s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
    .stxt{font-size:.72em}
    .success{font-size:.72em;color:#00ff88;text-align:center;margin-bottom:6px}
    .sent-box{background:#0d150d;border:1px solid #00ff88;border-radius:3px;padding:16px;font-size:.62em;color:#00ff88;word-break:break-all;line-height:1.7;margin:14px 0;max-height:120px;overflow-y:auto}
    .err{background:rgba(255,62,62,.07);border:1px solid #ff3e3e;border-radius:3px;padding:14px;font-size:.75em;color:#ff3e3e;margin:14px 0;text-align:center;line-height:1.5}
    .loader{display:inline-block;width:12px;height:12px;border:2px solid rgba(0,255,136,.2);border-top-color:#00ff88;border-radius:50%;animation:spin .8s linear infinite;vertical-align:middle;margin-right:6px}
    @keyframes spin{to{transform:rotate(360deg)}}
  </style>
</head>
<body>
<div class="card">
  <h1>🦅 CYBEREAGLE</h1>
  <div class="sub">SESSION GENERATOR</div>

  <!-- Step 1 -->
  <div class="step active" id="s1">
    <label>Your WhatsApp Number</label>
    <input id="phone" type="text" placeholder="923441675739"/>
    <p class="hint">Country code + number. No + or spaces.<br>Pakistan example: 923441675739</p>
    <button id="btn1" onclick="generate()">⚡ GET PAIRING CODE</button>
  </div>

  <!-- Step 2: Loading -->
  <div class="step" id="s-load">
    <div class="sbar">
      <div class="dot g"></div>
      <div class="stxt"><span class="loader"></span>Connecting to WhatsApp servers... (5-10 sec)</div>
    </div>
  </div>

  <!-- Step 3: Show Code -->
  <div class="step" id="s2">
    <div class="code-box">
      <div style="font-size:.65em;color:#4a7a4a;letter-spacing:3px;margin-bottom:12px">PAIRING CODE</div>
      <div class="code" id="code-val">----</div>
      <div class="code-note">⏱ Valid ~60 seconds — enter it fast!</div>
    </div>
    <div class="ins">
      <div class="ins-row"><div class="ins-n">01</div><div class="ins-t">Open <b>WhatsApp</b> on your phone</div></div>
      <div class="ins-row"><div class="ins-n">02</div><div class="ins-t">Tap <b>⋮ Menu</b> → <b>Linked Devices</b></div></div>
      <div class="ins-row"><div class="ins-n">03</div><div class="ins-t">Tap <b>Link a Device</b> → <b>Link with phone number instead</b></div></div>
      <div class="ins-row"><div class="ins-n">04</div><div class="ins-t">Type the <b>8-digit code</b> above and confirm</div></div>
    </div>
    <div class="sbar">
      <div class="dot o" id="sdot"></div>
      <div class="stxt" id="stxt">Waiting for you to enter the code in WhatsApp...</div>
    </div>
  </div>

  <!-- Step 4: Done -->
  <div class="step" id="s3">
    <p class="success" style="font-size:1.2em;margin-bottom:10px">✅ CONNECTED!</p>
    <p class="success">SESSION_ID has been sent to your WhatsApp number!</p>
    <p class="hint" style="text-align:center;margin-top:8px">Check your WhatsApp — you received a message from yourself with the SESSION_ID.<br><br>Copy it and paste into Render → Environment → SESSION_ID</p>
    <button onclick="location.reload()" style="margin-top:20px">↺ Generate Another</button>
  </div>

  <!-- Error -->
  <div class="step" id="s-err">
    <div class="err" id="errmsg">Something went wrong.</div>
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
    const phone = document.getElementById('phone').value.trim().replace(/\D/g,'');
    if (!phone || phone.length < 10) { alert('Enter a valid phone number with country code'); return; }
    document.getElementById('btn1').disabled = true;
    show('s-load');
    try {
      const res = await fetch('/generate', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ phone })
      });
      const d = await res.json();
      if (d.success) {
        document.getElementById('code-val').textContent = d.code;
        show('s2');
        startPoll();
      } else {
        document.getElementById('errmsg').textContent = '❌ ' + (d.error || 'Failed. Try again.');
        show('s-err');
      }
    } catch(e) {
      document.getElementById('errmsg').textContent = '❌ Network error: ' + e.message;
      show('s-err');
    }
  }

  function startPoll() {
    poll = setInterval(async () => {
      try {
        const r = await fetch('/status');
        const d = await r.json();
        if (d.status === 'done') {
          clearInterval(poll);
          show('s3');
        } else if (d.status === 'scanning') {
          document.getElementById('stxt').textContent = '🔄 Code accepted! Finishing connection...';
          document.getElementById('sdot').className = 'dot g';
        } else if (d.status === 'error') {
          clearInterval(poll);
          document.getElementById('errmsg').textContent = '❌ ' + (d.message || 'Connection failed.');
          show('s-err');
        }
      } catch(e) {}
    }, 2000);
  }
</script>
</body>
</html>`);
});

// ── GENERATE ENDPOINT ────────────────────────────────────────────────────────
app.post('/generate', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.json({ success: false, error: 'Phone number required' });
  try {
    const code = await startSession(phone);
    res.json({ success: true, code });
  } catch (e) {
    console.error('Error:', e.message);
    res.json({ success: false, error: e.message });
  }
});

// ── STATUS ENDPOINT ──────────────────────────────────────────────────────────
app.get('/status', (req, res) => {
  res.json({ status, message: errorMsg });
});

// ── CORE SESSION LOGIC ───────────────────────────────────────────────────────
async function startSession(phoneNumber) {
  const AUTH_DIR = './session_temp';
  if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive: true, force: true });

  pairingCode = null;
  sessionId = null;
  status = 'connecting';
  errorMsg = '';
  currentPhone = phoneNumber;

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
    browser: ['CyberEagle', 'Chrome', '120.0.0'],
    keepAliveIntervalMs: 10_000,
    defaultQueryTimeoutMs: undefined,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    // CRITICAL: without this WhatsApp hangs on "Logging in..." forever
    getMessage: async () => ({ conversation: '' }),
  });

  // Request pairing code when WhatsApp signals it's ready (on QR event)
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

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
        errorMsg = 'Could not get pairing code: ' + err.message;
      }
    }

    if (connection === 'connecting' && pairingCode) {
      status = 'scanning';
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp connected! Generating session...');
      status = 'connected';

      // Wait for creds to fully save
      await new Promise(r => setTimeout(r, 3000));

      const credsPath = path.join(AUTH_DIR, 'creds.json');
      if (fs.existsSync(credsPath)) {
        const credsRaw = fs.readFileSync(credsPath, 'utf8');
        const b64 = Buffer.from(credsRaw).toString('base64');
        sessionId = 'CYBEREAGLE~' + b64;
        console.log('🎉 SESSION_ID ready! Sending to WhatsApp...');

        // Send SESSION_ID to the user's own WhatsApp number
        const jid = phoneNumber + '@s.whatsapp.net';
        const msg = `🦅 *CyberEagle Session Generator*\n\n` +
          `✅ Your SESSION_ID is ready!\n\n` +
          `Copy everything below this line:\n\n` +
          `${sessionId}\n\n` +
          `Paste it in Render → Environment → SESSION_ID → redeploy your bot.`;

        await sock.sendMessage(jid, { text: msg });
        console.log('📨 SESSION_ID sent to WhatsApp!');
        status = 'done';
      } else {
        status = 'error';
        errorMsg = 'creds.json not found. Try again.';
      }
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log('Connection closed. Code:', code);
      if (status !== 'done') {
        status = 'error';
        errorMsg = code === DisconnectReason.loggedOut
          ? 'Logged out. Please try again.'
          : 'Connection dropped. Please try again.';
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Wait for pairing code (max 20 seconds)
  let waited = 0;
  while (!pairingCode && status !== 'error' && waited < 20000) {
    await new Promise(r => setTimeout(r, 500));
    waited += 500;
  }

  if (!pairingCode) throw new Error('Timed out. Check your internet and try again.');
  return pairingCode;
}

app.listen(PORT, () => {
  console.log(`🌐 CyberEagle Session Generator → port ${PORT}`);
});

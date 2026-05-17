import express from "express";
import fs from "fs";
import pino from "pino";
import {
    makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import pn from "awesome-phonenumber";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const router = express.Router();

async function generateSession(credsPath) {
    try {
        const credsData = fs.readFileSync(credsPath, 'utf-8');
        const base64Creds = Buffer.from(credsData).toString('base64');
        return { sessionId: `CYBEREAGLE~`, encodedData: base64Creds };
    } catch (e) {
        return null;
    }
}

function rm(p) {
    try {
        if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
    } catch(e) {}
}

router.get("/", async (req, res) => {
    let num = (req.query.number || "").replace(/[^0-9]/g, "");
    if (!num) return res.status(400).send({ code: "Number required" });

    const phone = pn("+" + num);
    if (!phone.isValid()) return res.status(400).send({ code: "Invalid number" });
    num = phone.getNumber("e164").replace("+", "");

    const dir = "./session_" + num + "_" + Date.now();
    rm(dir);

    const { state, saveCreds } = await useMultiFileAuthState(dir);
    const { version } = await fetchLatestBaileysVersion();

    let isLinking = false;
    let isDone = false;
    let sock;

    function closeSock() {
        try {
            // ✅ Close just this socket — NOT the whole process
            sock?.end();
        } catch(e) {}
        setTimeout(() => rm(dir), 3000);
    }

    sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
        },
        logger: pino({ level: "fatal" }),
        browser: Browsers.windows("Chrome"),
        printQRInTerminal: false,
        markOnlineOnConnect: false,
        keepAliveIntervalMs: 10_000,
        defaultQueryTimeoutMs: undefined,
        // Fixes "Logging in..." freeze
        getMessage: async () => ({ conversation: '' }),
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {

        if (connection === "open") {
            isLinking = false;
            isDone = false;
            console.log("✅ Connected:", num);

            try {
                await delay(3000);

                const credsPath = join(dir, 'creds.json');
                const sessionInfo = await generateSession(credsPath);
                if (!sessionInfo) throw new Error("Failed to generate session");

                const jid = jidNormalizedUser(num + "@s.whatsapp.net");
                const completeSession = `${sessionInfo.sessionId}${sessionInfo.encodedData}`;

                // Send SESSION_ID as WhatsApp message
                await sock.sendMessage(jid, { text: completeSession });
                await delay(2000);

                // Send info card
                const fakeVCard = {
                    key: { fromMe: false, participant: "0@s.whatsapp.net", remoteJid: "status@broadcast" },
                    message: {
                        contactMessage: {
                            displayName: "🦅 CyberEagle",
                            vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:🦅 CyberEagle\nORG:CyberEagle Bot;\nTEL;type=CELL;type=VOICE;waid=13135550002:+13135550002\nEND:VCARD`
                        }
                    }
                };

                const caption = `╭━〔 *🦅 CyberEagle* 〕━··๏
┃★╭──────────────
┃★│ 👑 Owner : *Nasir ™*
┃★│ 🤖 Baileys : *Multi Device*
┃★│ 💻 Type : *NodeJs*
┃★│ 🚀 Platform : *Render*
┃★│ ⚙️ Mode : *Public*
┃★│ 🔣 Prefix : *[ . ]*
┃★│ 🏷️ Version : *9.0.0*
┃★╰──────────────
╰━━━━━━━━━━━━━━┈⊷`;

                await sock.sendMessage(jid, {
                    image: { url: "https://files.catbox.moe/16i1l7.jpg" },
                    caption,
                    contextInfo: {
                        mentionedJid: [jid],
                        forwardingScore: 999,
                        isForwarded: true,
                    }
                }, { quoted: fakeVCard });

                isDone = true;
                console.log("🎉 Session sent to:", num);

                // ✅ Close only this socket, keep server alive
                await delay(2000);
                closeSock();

            } catch (err) {
                console.error("❌ Error after connect:", err.message);
                try {
                    const jid = jidNormalizedUser(num + "@s.whatsapp.net");
                    await sock.sendMessage(jid, { text: "❌ Error generating session. Please try again." });
                } catch(e) {}
                closeSock();
            }
        }

        if (connection === "close") {
            const code = lastDisconnect?.error?.output?.statusCode;
            console.log("🔌 Connection closed. Code:", code, "| linking:", isLinking, "| done:", isDone);

            // ✅ If we're done or still linking — do NOT restart
            if (isDone || isLinking) return;

            // Genuine disconnect before pairing — restart this socket only
            if (code !== 401) {
                console.log("🔄 Restarting socket for:", num);
                const { state: newState, saveCreds: newSaveCreds } = await useMultiFileAuthState(dir);
                sock.ev.removeAllListeners();

                const { version: v } = await fetchLatestBaileysVersion();
                sock = makeWASocket({
                    version: v,
                    auth: {
                        creds: newState.creds,
                        keys: makeCacheableSignalKeyStore(newState.keys, pino({ level: "fatal" })),
                    },
                    logger: pino({ level: "fatal" }),
                    browser: Browsers.windows("Chrome"),
                    printQRInTerminal: false,
                    markOnlineOnConnect: false,
                    keepAliveIntervalMs: 10_000,
                    defaultQueryTimeoutMs: undefined,
                    getMessage: async () => ({ conversation: '' }),
                });
                sock.ev.on("creds.update", newSaveCreds);
            }
        }
    });

    // Request pairing code
    if (!sock.authState.creds.registered) {
        await delay(1500);
        try {
            let code = await sock.requestPairingCode(num);
            code = code?.match(/.{1,4}/g)?.join("-") || code;
            console.log("📱 Pairing code for", num, ":", code);

            // ✅ Set linking AFTER code is generated and sent to browser
            isLinking = true;

            if (!res.headersSent) res.send({ success: true, code });
        } catch(err) {
            console.error("❌ Pairing request failed:", err.message);
            if (!res.headersSent) res.status(503).send({ code: "PAIR_FAIL", error: err.message });
            closeSock();
        }
    }
});

process.on("uncaughtException", (err) => {
    const e = String(err);
    if (
        e.includes("conflict") ||
        e.includes("not-authorized") ||
        e.includes("Timed Out") ||
        e.includes("Connection Closed") ||
        e.includes("Socket connection timeout")
    ) return;
    console.error("Uncaught:", err);
});

process.on("unhandledRejection", (err) => {
    console.error("Unhandled:", err);
});

export default router;

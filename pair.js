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
    } catch (error) {
        console.error("Session gen error:", error);
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

    const dir = "./session" + num;
    rm(dir);

    async function start() {
        const { state, saveCreds } = await useMultiFileAuthState(dir);
        const { version } = await fetchLatestBaileysVersion();

        // ✅ THE FIX: track when user has entered the code
        // so we don't restart the socket and kill the pairing
        let isLinking = false;

        const sock = makeWASocket({
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
            getMessage: async () => ({ conversation: '' }),
        });

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {

            if (connection === "open") {
                isLinking = false;
                try {
                    await delay(3000);

                    const credsPath = join(dir, 'creds.json');
                    const sessionInfo = await generateSession(credsPath);
                    if (!sessionInfo) throw new Error("Failed to generate session");

                    const jid = jidNormalizedUser(num + "@s.whatsapp.net");
                    const completeSession = `${sessionInfo.sessionId}${sessionInfo.encodedData}`;

                    // Send SESSION_ID
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

                    await delay(2000);
                    rm(dir);
                    setTimeout(() => process.exit(0), 1000);

                } catch (err) {
                    console.error("❌ Error:", err);
                    rm(dir);
                    try {
                        const jid = jidNormalizedUser(num + "@s.whatsapp.net");
                        await sock.sendMessage(jid, { text: "❌ Error generating session. Please try again." });
                    } catch(e) {}
                    process.exit(1);
                }
            }

            if (connection === "close") {
                const code = lastDisconnect?.error?.output?.statusCode;
                console.log("Connection closed. Code:", code, "isLinking:", isLinking);

                // ✅ KEY FIX: if user is entering the pairing code right now
                // WhatsApp drops and re-opens the connection — DO NOT restart
                // Restarting here creates a new socket which kills the pairing
                if (isLinking) {
                    console.log("🔗 Linking in progress — not restarting socket");
                    return;
                }

                // Only restart if genuinely disconnected before pairing
                if (code !== 401) {
                    setTimeout(() => start(), 2000);
                }
            }
        });

        if (!sock.authState.creds.registered) {
            await delay(1500);
            try {
                let code = await sock.requestPairingCode(num);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log("✅ Pairing code:", code);

                // ✅ Set flag AFTER code is sent to user
                isLinking = true;

                if (!res.headersSent) res.send({ success: true, code });
            } catch(err) {
                console.error("Pairing error:", err);
                if (!res.headersSent) res.status(503).send({ code: "PAIR_FAIL", error: err.message });
                rm(dir);
                process.exit(1);
            }
        }
    }

    start();
});

process.on("uncaughtException", (err) => {
    const e = String(err);
    if (e.includes("conflict") || e.includes("not-authorized") || e.includes("Timed Out")) return;
    console.error("Crash:", err);
});

process.on("unhandledRejection", (err) => {
    console.error("Unhandled:", err);
});

export default router;

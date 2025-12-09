// Windbi Bot WhatsApp - Stable Version
// Created by humpreyDev

const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers 
} = require('@adiwajshing/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const axios = require('axios');
const moment = require('moment-timezone');

// Configuration
const CONFIG = {
    OWNER: '6285929088764',
    PREFIX: '.',
    BOT_NAME: 'Windbi Bot',
    VERSION: '3.0.0'
};

// Data storage
const games = {
    tebakkata: {
        questions: [
            { q: "Apa yang selalu datang tapi tidak pernah sampai?", a: "besok" },
            { q: "Apa yang punya kaki tapi tidak bisa berjalan?", a: "kursi" },
            { q: "Apa yang semakin banyak diambil, semakin besar?", a: "lubang" },
            { q: "Apa yang berat di musim panas, ringan di musim dingin?", a: "nafas" }
        ],
        active: new Map()
    },
    tebakangka: {
        active: new Map()
    },
    mathquiz: {
        active: new Map()
    }
};

// Simple logger
const logger = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    error: (msg) => console.error(`[ERROR] ${msg}`),
    warn: (msg) => console.warn(`[WARN] ${msg}`)
};

// System stats function
async function getSystemStats() {
    try {
        const cpus = os.cpus();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const uptime = os.uptime();
        
        const days = Math.floor(uptime / (3600 * 24));
        const hours = Math.floor((uptime % (3600 * 24)) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const uptimeStr = `${days}d ${hours}h ${minutes}m`;
        
        return {
            cpu: `${cpus[0].model.split(' ')[0]} (${cpus.length} core)`,
            ram: `${(usedMem / 1024 / 1024 / 1024).toFixed(2)}GB / ${(totalMem / 1024 / 1024 / 1024).toFixed(2)}GB`,
            uptime: uptimeStr,
            platform: process.platform,
            node: process.version
        };
    } catch (error) {
        return {
            cpu: 'Unknown',
            ram: 'Unknown',
            uptime: 'Unknown',
            platform: process.platform,
            node: process.version
        };
    }
}

// Create menu
async function createMenu() {
    const stats = await getSystemStats();
    
    return `╭╼━━━━━━━━━━━━━━━━━━━━╾❐
│ 🤖 𝗪𝗜𝗡𝗗𝗕𝗜 𝗕𝗢𝗧 v${CONFIG.VERSION}
├╼━━━━━━━━━━━━━━━━━━━━╾╮
│ 📊 𝗦𝗬𝗦𝗧𝗘𝗠 𝗦𝗧𝗔𝗧𝗦
│ • CPU   : ${stats.cpu}
│ • RAM   : ${stats.ram}
│ • UPTIME: ${stats.uptime}
│ • PLAT  : ${stats.platform}
│
│ 🟢 𝗦𝗧𝗔𝗧𝗨𝗦 : 𝗢𝗡𝗟𝗜𝗡𝗘
├╼━━━━━━━━━━━━━━━━━━━━╾〢
│ Dibuat oleh humpreyDev
│ Bot WhatsApp Multifungsi
│ Node.js ${stats.node}
╰╼━━━━━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗣𝗨𝗕𝗟𝗜𝗞 ⧽━╾❐
│ • ${CONFIG.PREFIX}menu
│ • ${CONFIG.PREFIX}owner
│ • ${CONFIG.PREFIX}github
│ • ${CONFIG.PREFIX}stats
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗚𝗔𝗠𝗘𝗦 ⧽━╾❐
│ • ${CONFIG.PREFIX}tebakkata
│ • ${CONFIG.PREFIX}mathquiz
│ • ${CONFIG.PREFIX}tebakangka
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗙𝗨𝗡 ⧽━╾❐
│ • ${CONFIG.PREFIX}cekiman @tag
│ • ${CONFIG.PREFIX}cekfemboy @tag
│ • ${CONFIG.PREFIX}cekfurry @tag
│ • ${CONFIG.PREFIX}cekjamet @tag
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗔𝗗𝗠𝗜𝗡 ⧽━╾❐
│ • ${CONFIG.PREFIX}kick @tag
│ • ${CONFIG.PREFIX}grup buka|tutup
│ • ${CONFIG.PREFIX}totag
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗢𝗪𝗡𝗘𝗥 ⧽━╾❐
│ • ${CONFIG.PREFIX}apistatus
│ • ${CONFIG.PREFIX}restart
╰╼━━━━━━━━━━━━━━━━╾❏

> Copyright © 2025 humpreyDev
> Repository: https://github.com/humpreydev-hash/windbi-botm`;
}

// Check API status
async function checkAPIs() {
    const apis = [
        { name: 'YouTube', url: 'https://youtube.com' },
        { name: 'GitHub', url: 'https://github.com' },
        { name: 'Railways', url: 'https://railway.app' },
        { name: 'Node.js', url: 'https://nodejs.org' }
    ];
    
    let result = '╭╼━⧼ 𝗔𝗣𝗜 𝗦𝗧𝗔𝗧𝗨𝗦 ⧽━╾❐\n';
    
    for (const api of apis) {
        try {
            await axios.head(api.url, { timeout: 3000 });
            result += `│ ✅ ${api.name}: ONLINE\n`;
        } catch {
            result += `│ ❌ ${api.name}: OFFLINE\n`;
        }
    }
    
    result += '╰╼━━━━━━━━━━━━━━━━╾❏';
    return result;
}

// Check luck
function checkLuck() {
    const percentage = Math.floor(Math.random() * 100);
    let emoji = '😢';
    if (percentage > 80) emoji = '🎉';
    else if (percentage > 60) emoji = '😊';
    else if (percentage > 40) emoji = '😐';
    else if (percentage > 20) emoji = '😕';
    return `${percentage}% ${emoji}`;
}

// Start bot function
async function startBot() {
    logger.info('Starting Windbi Bot...');
    
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const { version, isLatest } = await fetchLatestBaileysVersion();
    logger.info(`Using Baileys v${version.join('.')} ${isLatest ? '(latest)' : ''}`);
    
    const sock = makeWASocket({
        version,
        logger: { level: 'silent' },
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, { logger: { level: 'silent' } }),
        },
        browser: Browsers.macOS('Desktop'),
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
    });
    
    // Connection update handler
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            logger.info('QR Code generated. Please scan:');
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            logger.warn(`Connection closed. Status: ${statusCode}`);
            
            if (shouldReconnect) {
                logger.info('Reconnecting in 5 seconds...');
                setTimeout(startBot, 5000);
            } else {
                logger.error('Logged out. Please delete auth_info folder and rescan QR.');
            }
        }
        
        if (connection === 'open') {
            logger.info('✅ Bot connected successfully!');
            logger.info(`👤 User: ${sock.user?.name || 'Unknown'}`);
            logger.info(`📞 JID: ${sock.user?.id || 'Unknown'}`);
            
            // Send welcome to owner
            setTimeout(async () => {
                try {
                    const ownerJid = `${CONFIG.OWNER}@s.whatsapp.net`;
                    await sock.sendMessage(ownerJid, {
                        text: `🤖 *${CONFIG.BOT_NAME} v${CONFIG.VERSION} Aktif!*\n\nBot berhasil terhubung ke WhatsApp.\nKetik *${CONFIG.PREFIX}menu* untuk mulai.`
                    });
                } catch (err) {
                    logger.error('Failed to send welcome message to owner');
                }
            }, 2000);
        }
    });
    
    // Save credentials
    sock.ev.on('creds.update', saveCreds);
    
    // Message handler
    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;
            
            // Extract message content
            const messageType = Object.keys(msg.message)[0];
            let text = '';
            
            if (messageType === 'conversation') {
                text = msg.message.conversation;
            } else if (messageType === 'extendedTextMessage') {
                text = msg.message.extendedTextMessage.text;
            }
            
            if (!text) return;
            
            const from = msg.key.remoteJid;
            const sender = msg.key.participant || from;
            const isGroup = from.endsWith('@g.us');
            const isOwner = sender === `${CONFIG.OWNER}@s.whatsapp.net`;
            const botJid = sock.user?.id;
            
            // Check if bot is mentioned
            const mentioned = msg.message[messageType]?.contextInfo?.mentionedJid?.includes(botJid);
            
            // Get group info
            let isAdmin = false;
            if (isGroup) {
                try {
                    const metadata = await sock.groupMetadata(from);
                    const participant = metadata.participants.find(p => p.id === sender);
                    isAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';
                } catch (err) {
                    logger.error('Error fetching group metadata:', err);
                }
            }
            
            // Handle commands
            const isCommand = text.startsWith(CONFIG.PREFIX) || mentioned;
            if (isCommand) {
                const args = text.trim().split(' ');
                const cmd = args[0].toLowerCase().replace(CONFIG.PREFIX, '');
                const rest = args.slice(1).join(' ');
                
                logger.info(`Command: ${cmd} from ${sender}`);
                
                // Main menu
                if (cmd === 'menu' || mentioned) {
                    const menu = await createMenu();
                    await sock.sendMessage(from, { text: menu });
                }
                
                // Owner info
                else if (cmd === 'owner') {
                    await sock.sendMessage(from, {
                        text: `👤 *Owner Information*\n\n• Name: humpreyDev\n• Number: +${CONFIG.OWNER}\n• GitHub: https://github.com/humpreydev-hash\n• Repo: https://github.com/humpreydev-hash/windbi-botm\n\nContact for collaboration or issues.`
                    });
                }
                
                // GitHub
                else if (cmd === 'github') {
                    await sock.sendMessage(from, {
                        text: `💻 *GitHub Repository*\n\nhttps://github.com/humpreydev-hash/windbi-botm\n\n⭐ Please star the repo!\n🔧 Built with Node.js & Baileys\n📱 WhatsApp Bot Multi-Device`
                    });
                }
                
                // Stats
                else if (cmd === 'stats') {
                    const stats = await getSystemStats();
                    await sock.sendMessage(from, {
                        text: `📊 *System Statistics*\n\n• Bot: ${CONFIG.BOT_NAME} v${CONFIG.VERSION}\n• Node: ${stats.node}\n• Platform: ${stats.platform}\n• Uptime: ${stats.uptime}\n• CPU: ${stats.cpu}\n• RAM: ${stats.ram}\n\nStatus: 🟢 ONLINE`
                    });
                }
                
                // Games
                else if (cmd === 'tebakkata') {
                    const questions = games.tebakkata.questions;
                    const randomQ = questions[Math.floor(Math.random() * questions.length)];
                    
                    if (isGroup) {
                        games.tebakkata.active.set(from, {
                            question: randomQ.q,
                            answer: randomQ.a,
                            timestamp: Date.now()
                        });
                    }
                    
                    await sock.sendMessage(from, {
                        text: `🎮 *TEBAK KATA*\n\nPertanyaan: "${randomQ.q}"\n\nJawab dengan: ${CONFIG.PREFIX}jawab [jawaban]`
                    });
                }
                
                else if (cmd === 'mathquiz') {
                    const num1 = Math.floor(Math.random() * 100) + 1;
                    const num2 = Math.floor(Math.random() * 50) + 1;
                    const op = ['+', '-', '*'][Math.floor(Math.random() * 3)];
                    let answer;
                    
                    switch(op) {
                        case '+': answer = num1 + num2; break;
                        case '-': answer = num1 - num2; break;
                        case '*': answer = num1 * num2; break;
                    }
                    
                    if (isGroup) {
                        games.mathquiz.active.set(from, {
                            question: `${num1} ${op} ${num2}`,
                            answer: answer,
                            timestamp: Date.now()
                        });
                    }
                    
                    await sock.sendMessage(from, {
                        text: `🧮 *MATH QUIZ*\n\nSoal: ${num1} ${op} ${num2} = ?\n\nJawab dengan: ${CONFIG.PREFIX}jawab [angka]`
                    });
                }
                
                else if (cmd === 'tebakangka') {
                    const number = Math.floor(Math.random() * 100) + 1;
                    
                    if (isGroup) {
                        games.tebakangka.active.set(from, {
                            answer: number,
                            timestamp: Date.now()
                        });
                    }
                    
                    await sock.sendMessage(from, {
                        text: `🔢 *TEBAK ANGKA*\n\nSaya memikirkan angka 1-100\n\nTebak dengan: ${CONFIG.PREFIX}jawab [angka]`
                    });
                }
                
                else if (cmd === 'jawab') {
                    const answer = rest.toLowerCase();
                    
                    // Check all games
                    const checkGame = (gameMap, checkFn) => {
                        if (gameMap.has(from)) {
                            const game = gameMap.get(from);
                            if (checkFn(game, answer)) {
                                gameMap.delete(from);
                                return true;
                            }
                        }
                        return false;
                    };
                    
                    if (checkGame(games.tebakkata.active, (game, ans) => ans === game.answer)) {
                        await sock.sendMessage(from, { text: `✅ *BENAR!* 🎉\nJawaban tepat!` });
                    }
                    else if (checkGame(games.mathquiz.active, (game, ans) => parseInt(ans) === game.answer)) {
                        await sock.sendMessage(from, { text: `✅ *BENAR!* 🎉\n${game.question} = ${game.answer}` });
                    }
                    else if (checkGame(games.tebakangka.active, (game, ans) => {
                        const guess = parseInt(ans);
                        if (isNaN(guess)) return false;
                        
                        if (guess === game.answer) return true;
                        else {
                            const hint = guess < game.answer ? '📈 Terlalu rendah!' : '📉 Terlalu tinggi!';
                            sock.sendMessage(from, { text: hint });
                            return false;
                        }
                    })) {
                        await sock.sendMessage(from, { text: `✅ *BENAR!* 🎉\nAngka ${answer} tepat!` });
                    }
                    else if (games.tebakkata.active.has(from) || games.mathquiz.active.has(from) || games.tebakangka.active.has(from)) {
                        // Already handled in checkGame
                    } else {
                        await sock.sendMessage(from, { text: '❌ Tidak ada game aktif!' });
                    }
                }
                
                // Fun commands
                else if (cmd.startsWith('cek')) {
                    const mentionedUser = msg.message[messageType]?.contextInfo?.mentionedJid?.[0] || sender;
                    const username = mentionedUser.split('@')[0];
                    const percentage = checkLuck();
                    
                    const funTypes = {
                        cekiman: { title: '🕌 CEK IMAN', emoji: '📿' },
                        cekfemboy: { title: '🌸 CEK FEMBOY', emoji: '💖' },
                        cekfurry: { title: '🐾 CEK FURRY', emoji: '🦁' },
                        cekjamet: { title: '🚬 CEK JAMET', emoji: '🏍️' }
                    };
                    
                    if (funTypes[cmd]) {
                        const { title, emoji } = funTypes[cmd];
                        await sock.sendMessage(from, {
                            text: `${title} ${emoji}\n\n@${username}: ${percentage}`,
                            mentions: [mentionedUser]
                        });
                    }
                }
                
                // Admin commands
                else if (cmd === 'kick' && (isOwner || isAdmin)) {
                    if (!isGroup) {
                        await sock.sendMessage(from, { text: '❌ Hanya untuk grup!' });
                        return;
                    }
                    
                    const mentionedUsers = msg.message[messageType]?.contextInfo?.mentionedJid || [];
                    if (mentionedUsers.length === 0) {
                        await sock.sendMessage(from, { text: '❌ Tag member yang akan di-kick!' });
                        return;
                    }
                    
                    for (const user of mentionedUsers) {
                        try {
                            await sock.groupParticipantsUpdate(from, [user], 'remove');
                            await sock.sendMessage(from, {
                                text: `✅ @${user.split('@')[0]} dikick`,
                                mentions: [user]
                            });
                        } catch (err) {
                            logger.error('Kick error:', err);
                        }
                    }
                }
                
                else if (cmd === 'grup' && (isOwner || isAdmin)) {
                    if (!isGroup) {
                        await sock.sendMessage(from, { text: '❌ Hanya untuk grup!' });
                        return;
                    }
                    
                    const action = rest.toLowerCase();
                    if (action === 'buka') {
                        await sock.groupSettingUpdate(from, 'not_announcement');
                        await sock.sendMessage(from, { text: '✅ Grup dibuka!' });
                    } else if (action === 'tutup') {
                        await sock.groupSettingUpdate(from, 'announcement');
                        await sock.sendMessage(from, { text: '🔒 Grup ditutup!' });
                    } else {
                        await sock.sendMessage(from, { text: '❌ Gunakan: .grup buka|tutup' });
                    }
                }
                
                else if (cmd === 'totag' && (isOwner || isAdmin)) {
                    if (!isGroup) {
                        await sock.sendMessage(from, { text: '❌ Hanya untuk grup!' });
                        return;
                    }
                    
                    try {
                        const metadata = await sock.groupMetadata(from);
                        let text = '📢 *TAG ALL*\n\n';
                        const mentions = [];
                        
                        for (const participant of metadata.participants) {
                            if (participant.id !== botJid) {
                                text += `@${participant.id.split('@')[0]} `;
                                mentions.push(participant.id);
                            }
                        }
                        
                        text += '\n\n_Ditag oleh admin_';
                        await sock.sendMessage(from, { text, mentions });
                    } catch (err) {
                        logger.error('Tag error:', err);
                    }
                }
                
                // Owner only commands
                else if (cmd === 'apistatus' && isOwner) {
                    const apiStatus = await checkAPIs();
                    await sock.sendMessage(from, { text: apiStatus });
                }
                
                else if (cmd === 'restart' && isOwner) {
                    await sock.sendMessage(from, { text: '🔄 Restarting bot...' });
                    setTimeout(() => {
                        logger.info('Restarting by owner command');
                        process.exit(0);
                    }, 2000);
                }
                
                // Unknown command
                else if (text.startsWith(CONFIG.PREFIX)) {
                    await sock.sendMessage(from, {
                        text: `❌ Command tidak dikenal!\nKetik ${CONFIG.PREFIX}menu untuk bantuan.`
                    });
                }
            }
        } catch (error) {
            logger.error('Message handler error:', error);
        }
    });
    
    // Presence update handler
    sock.ev.on('presence.update', ({ id, presences }) => {
        // Optional: Handle presence updates
    });
    
    // Group updates handler
    sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
        // Optional: Handle group events
    });
}

// Display banner
console.log('╔══════════════════════════════════════════╗');
console.log('║           WINDIBI BOT v3.0              ║');
console.log('║        WhatsApp Bot by humpreyDev       ║');
console.log('║       Repository: windbi-botm          ║');
console.log('╚══════════════════════════════════════════╝');
console.log(`📅 ${moment().tz('Asia/Jakarta').format('DD/MM/YYYY HH:mm:ss')}`);
console.log(`🏢 Platform: ${process.platform}`);
console.log(`⚙️ Node.js: ${process.version}`);
console.log(`📱 Owner: ${CONFIG.OWNER}`);
console.log(`🔧 Prefix: ${CONFIG.PREFIX}`);
console.log('════════════════════════════════════════════');

// Error handling
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    logger.error('Unhandled Rejection:', error);
});

// Start the bot
startBot().catch(error => {
    logger.error('Failed to start bot:', error);
    logger.info('Restarting in 10 seconds...');
    setTimeout(() => process.exit(1), 10000);
});
const { default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    Browsers,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const axios = require('axios');
const ytdl = require('ytdl-core');
const yts = require('yt-search');
const { exec } = require('child_process');
const util = require('util');
const moment = require('moment-timezone');

const execAsync = util.promisify(exec);

// Owner number
const ownerNumber = '6285929088764';
const prefix = '.';

// Data games
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

// Simple in-memory store
const store = {
    messages: new Map(),
    contacts: new Map(),
    groups: new Map()
};

// Fungsi untuk mendapatkan statistik sistem
async function getSystemStats() {
    try {
        const cpus = os.cpus();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        
        // Get uptime
        const uptime = os.uptime();
        const days = Math.floor(uptime / (3600 * 24));
        const hours = Math.floor((uptime % (3600 * 24)) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const uptimeStr = `${days}d ${hours}h ${minutes}m`;
        
        // Get disk info (simplified)
        let diskInfo = 'Unknown';
        try {
            if (process.platform === 'win32') {
                diskInfo = 'Windows System';
            } else {
                // For Unix/Linux/Railways
                diskInfo = 'Railways/Cloud';
            }
        } catch (error) {
            diskInfo = 'Error getting disk info';
        }
        
        return {
            cpu: `${cpus[0].model.split(' ')[0]} ${cpus.length} cores`,
            ram: `${(usedMem / 1024 / 1024 / 1024).toFixed(2)}GB / ${(totalMem / 1024 / 1024 / 1024).toFixed(2)}GB`,
            disk: diskInfo,
            uptime: uptimeStr
        };
    } catch (error) {
        console.error('Error getting system stats:', error);
        return {
            cpu: 'Unknown CPU',
            ram: 'Unknown RAM',
            disk: 'Unknown Disk',
            uptime: 'Unknown'
        };
    }
}

// Fungsi untuk membuat menu
async function createMenu() {
    const stats = await getSystemStats();
    
    return `╭╼━━━━━━━━━━━━━━━━━━━━╾❐
│ 𝗪𝗜𝗡𝗗𝗕𝗜 𝗕𝗢𝗧 𝗪𝗛𝗔𝗧𝗦𝗔𝗣𝗣
├╼━━━━━━━━━━━━━━━━━━━━╾╮
│ 𝗨𝗣𝗧𝗜𝗠𝗘 𝗦𝗬𝗦𝗧𝗘𝗠
│ • CPU   : ${stats.cpu}
│ • RAM   : ${stats.ram}
│ • DISK  : ${stats.disk}
│ • UPTIME: ${stats.uptime}
│
│ 𝗦𝗧𝗔𝗧𝗨𝗦 : 𝙊𝙉𝙇𝙄𝙉𝙀
├╼━━━━━━━━━━━━━━━━━━━━╾〢
│ Bot ini dibuat oleh aal
│ [humpreyDev]. Bot simple
│ menggunakan Node.js. Ini
│ adalah project kedua setelah
│ Windbiom AI.
╰╼━━━━━━━━━━━━━━━━━━━━╾❏


╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗣𝗨𝗕𝗟𝗜𝗞 ⧽━╾❐
│ • ${prefix}verify
│ • ${prefix}link
│ • ${prefix}gig
│ • ${prefix}github
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗚𝗔𝗠𝗘𝗦 ⧽━╾❐
│ • ${prefix}tebakkata
│ • ${prefix}mathquiz
│ • ${prefix}tebakangka
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗙𝗨𝗡 ⧽━╾❐
│ • ${prefix}cekiman <@..>
│ • ${prefix}cekfemboy <@..>
│ • ${prefix}cekfurry <@..>
│ • ${prefix}cekjamet <@..>
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗥 ⧽━╾❐
│ • ${prefix}playyt <link>
│ • ${prefix}yt <url>
│ • ${prefix}ig <url>
│ • ${prefix}tt <url>
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗔𝗗𝗠𝗜𝗡 ⧽━╾❐
│ • ${prefix}kick <@..>
│ • ${prefix}ban <@..>
│ • ${prefix}grup buka|tutup
│ • ${prefix}totag
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗢𝗪𝗡𝗘𝗥 ⧽━╾❐
│ • ${prefix}npm <library>
│ • ${prefix}gclone <github link>
│ • ${prefix}apistatus
│ • ${prefix}restart
╰╼━━━━━━━━━━━━━━━━╾❏


> Copyright © humpreyDev
> "Setiap file yang gua ketik,
> pasti ada 100 error, tapi
> 1% progress tetap progress."`;
}

// Fungsi untuk cek status API
async function checkAPIs() {
    const apis = [
        { name: 'YouTube', url: 'https://www.youtube.com' },
        { name: 'Instagram', url: 'https://www.instagram.com' },
        { name: 'TikTok', url: 'https://www.tiktok.com' },
        { name: 'GitHub', url: 'https://github.com' },
        { name: 'NPM', url: 'https://registry.npmjs.org' },
        { name: 'Railways', url: 'https://railway.app' }
    ];
    
    let result = '╭╼━⧼ 𝗔𝗣𝗜 𝗦𝗧𝗔𝗧𝗨𝗦 ⧽━╾❐\n';
    
    for (const api of apis) {
        try {
            await axios.get(api.url, { timeout: 3000 });
            result += `│ ✅ ${api.name}: ONLINE\n`;
        } catch (error) {
            result += `│ ❌ ${api.name}: OFFLINE\n`;
        }
    }
    
    result += '╰╼━━━━━━━━━━━━━━━━╾❏';
    return result;
}

// Fungsi untuk download YouTube
async function downloadYouTube(url, type = 'audio') {
    try {
        const info = await ytdl.getInfo(url);
        const format = ytdl.chooseFormat(info.formats, { 
            quality: type === 'audio' ? 'highestaudio' : 'highest'
        });
        
        return {
            title: info.videoDetails.title,
            url: format.url,
            duration: info.videoDetails.lengthSeconds,
            thumbnail: info.videoDetails.thumbnails[0].url,
            type: type
        };
    } catch (error) {
        console.error('YouTube download error:', error);
        return null;
    }
}

// Fungsi untuk search YouTube
async function searchYouTube(query) {
    try {
        const search = await yts(query);
        return search.videos.slice(0, 5);
    } catch (error) {
        console.error('YouTube search error:', error);
        return [];
    }
}

// Fungsi untuk cek keberuntungan
function checkLuck(percentage = 100) {
    const random = Math.floor(Math.random() * percentage);
    const emoji = random > 80 ? '🎉' : random > 60 ? '😊' : random > 40 ? '😐' : random > 20 ? '😕' : '😢';
    return `${random}% ${emoji}`;
}

// Fungsi untuk membuat button
function createButtons(buttons) {
    return {
        text: 'Pilih menu:',
        footer: 'Windbi Bot - by humpreyDev',
        buttons: buttons,
        headerType: 1
    };
}

// Main function
async function startBot() {
    console.log('🔄 Membuat sesi bot...');
    
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
        version,
        logger: { level: 'silent' },
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, { logger: { level: 'silent' } }),
        },
        browser: Browsers.ubuntu('Chrome'),
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        emitOwnEvents: true,
        defaultQueryTimeoutMs: 0,
    });
    
    // Generate QR Code
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('📱 Scan QR Code ini dengan WhatsApp:');
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`🔌 Koneksi terputus: ${lastDisconnect?.error?.message || 'unknown'}`);
            
            if (shouldReconnect) {
                console.log('🔄 Mencoba reconnect dalam 5 detik...');
                setTimeout(() => {
                    startBot();
                }, 5000);
            }
        } else if (connection === 'open') {
            console.log('✅ Bot terhubung ke WhatsApp!');
            console.log(`👤 User ID: ${sock.user.id}`);
            console.log(`📞 Owner: ${ownerNumber}`);
            
            // Send message to owner when bot starts
            const ownerJid = ownerNumber.includes('-') ? ownerNumber : `${ownerNumber}@s.whatsapp.net`;
            try {
                await sock.sendMessage(ownerJid, { 
                    text: '🤖 *Windbi Bot Aktif!*\nBot sudah online dan siap digunakan!\n\nKetik *.menu* untuk melihat daftar command.'
                });
            } catch (error) {
                console.log('⚠️ Tidak bisa mengirim ke owner:', error.message);
            }
        }
    });
    
    // Save credentials
    sock.ev.on('creds.update', saveCreds);
    
    // Handle messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;
            
            const messageType = Object.keys(msg.message)[0];
            let text = '';
            
            if (messageType === 'conversation') {
                text = msg.message.conversation;
            } else if (messageType === 'extendedTextMessage') {
                text = msg.message.extendedTextMessage.text;
            }
            
            if (!text) return;
            
            const textLower = text.toLowerCase();
            const from = msg.key.remoteJid;
            const sender = msg.key.participant || from;
            const isGroup = from.endsWith('@g.us');
            const isOwner = sender === `${ownerNumber}@s.whatsapp.net`;
            const botJid = sock.user.id;
            
            // Get group metadata untuk cek admin
            let isAdmin = false;
            let isGroupAdmin = false;
            if (isGroup) {
                try {
                    const metadata = await sock.groupMetadata(from);
                    const participant = metadata.participants.find(p => p.id === sender);
                    isGroupAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';
                    isAdmin = isOwner || isGroupAdmin;
                } catch (error) {
                    console.error('Error getting group metadata:', error);
                }
            } else {
                isAdmin = isOwner;
            }
            
            // Handle commands
            if (textLower.startsWith(prefix) || msg.message[messageType]?.contextInfo?.mentionedJid?.includes(botJid)) {
                const command = textLower.replace(prefix, '').split(' ')[0].trim();
                const args = text.slice(text.indexOf(' ') + 1).trim();
                
                console.log(`📩 Command: ${command} from ${sender}`);
                
                // Menu utama dengan button
                if (command === 'menu' || textLower.includes('menu')) {
                    const menu = await createMenu();
                    
                    // Create buttons
                    const buttons = [
                        { buttonId: `${prefix}verify`, buttonText: { displayText: '✅ Verify' }, type: 1 },
                        { buttonId: `${prefix}games`, buttonText: { displayText: '🎮 Games' }, type: 1 },
                        { buttonId: `${prefix}download`, buttonText: { displayText: '📥 Download' }, type: 1 }
                    ];
                    
                    await sock.sendMessage(from, { 
                        text: menu,
                        ...createButtons(buttons)
                    });
                }
                
                // Button handler
                else if (command === 'verify') {
                    await sock.sendMessage(from, { 
                        text: '✅ *Verifikasi Berhasil!*\nAnda telah terverifikasi sebagai pengguna Windbi Bot.\n\nNama: ' + (isGroup ? 'Group User' : 'Private User') + '\nStatus: Verified ✅'
                    });
                }
                else if (command === 'games') {
                    const gamesMenu = `╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗚𝗔𝗠𝗘𝗦 ⧽━╾❐
│ • ${prefix}tebakkata
│ • ${prefix}mathquiz
│ • ${prefix}tebakangka
╰╼━━━━━━━━━━━━━━━━╾❏`;
                    
                    await sock.sendMessage(from, { text: gamesMenu });
                }
                else if (command === 'download') {
                    const downloadMenu = `╭╼━⧼ 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗥 ⧽━╾❐
│ • ${prefix}playyt <link> (Audio)
│ • ${prefix}yt <url> (Video)
│ • ${prefix}ig <url> (Instagram)
│ • ${prefix}tt <url> (TikTok)
╰╼━━━━━━━━━━━━━━━━╾❏`;
                    
                    await sock.sendMessage(from, { text: downloadMenu });
                }
                
                // Public menu
                else if (command === 'link') {
                    await sock.sendMessage(from, { 
                        text: '🔗 *Link Penting:*\n\n• GitHub Profile: https://github.com/humpreydev-hash\n• Repository Bot: https://github.com/humpreydev-hash/windbi-botm\n• Contact Owner: wa.me/6285929088764\n\n_Jangan lupa follow dan star repo! ⭐_'
                    });
                }
                else if (command === 'gig') {
                    await sock.sendMessage(from, { 
                        text: '💼 *Gig Services by humpreyDev:*\n\n• WhatsApp Bot Development\n• Web Development (Node.js, React)\n• API Integration & Automation\n• Custom Scripts & Tools\n• Bug Fixing & Optimization\n\n💰 *Harga mulai dari 50k*\n📞 Hubungi: wa.me/6285929088764'
                    });
                }
                else if (command === 'github') {
                    await sock.sendMessage(from, { 
                        text: '👨‍💻 *GitHub Repository:*\nhttps://github.com/humpreydev-hash/windbi-botm\n\n🌟 *Fitur:*\n- WhatsApp Bot Multi Device\n- Downloader YouTube/Instagram\n- Games & Fun Commands\n- Admin Tools\n- System Monitoring\n\n_Jangan lupa kasih star ⭐ dan fork!_\n_Support developer dengan follow ❤️_'
                    });
                }
                
                // Games menu
                else if (command === 'tebakkata') {
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
                        text: `🎮 *TEBAK KATA*\n\n📝 Pertanyaan: "${randomQ.q}"\n\n⚡ Jawab dengan: *${prefix}jawab [jawaban]*\n⏱️ Waktu: 60 detik`
                    });
                }
                else if (command === 'mathquiz') {
                    const num1 = Math.floor(Math.random() * 100) + 1;
                    const num2 = Math.floor(Math.random() * 50) + 1;
                    const operators = ['+', '-', '*'];
                    const op = operators[Math.floor(Math.random() * operators.length)];
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
                        text: `🧮 *MATH QUIZ*\n\n📊 Soal: ${num1} ${op} ${num2} = ?\n\n⚡ Jawab dengan: *${prefix}jawab [angka]*\n⏱️ Waktu: 30 detik`
                    });
                }
                else if (command === 'tebakangka') {
                    const number = Math.floor(Math.random() * 100) + 1;
                    
                    if (isGroup) {
                        games.tebakangka.active.set(from, {
                            answer: number,
                            timestamp: Date.now()
                        });
                    }
                    
                    await sock.sendMessage(from, { 
                        text: `🔢 *TEBAK ANGKA*\n\n🎯 Saya memikirkan angka antara 1-100\n\n⚡ Tebak dengan: *${prefix}jawab [angka]*\n💡 Tips: Saya akan kasih petunjuk!\n⏱️ Waktu: Unlimited`
                    });
                }
                else if (command.startsWith('jawab')) {
                    const answer = args.toLowerCase();
                    
                    if (games.tebakkata.active.has(from)) {
                        const game = games.tebakkata.active.get(from);
                        if (Date.now() - game.timestamp > 60000) {
                            await sock.sendMessage(from, { 
                                text: `⏰ *WAKTU HABIS!*\nJawaban: "${game.answer}"\n\nGunakan *${prefix}tebakkata* untuk main lagi!`
                            });
                            games.tebakkata.active.delete(from);
                        } else if (answer === game.answer) {
                            await sock.sendMessage(from, { 
                                text: `✅ *BENAR!* 🎉\nJawaban "${game.answer}" tepat!\n\n🏆 Kamu hebat!`
                            });
                            games.tebakkata.active.delete(from);
                        } else {
                            await sock.sendMessage(from, { 
                                text: `❌ *SALAH!*\nCoba lagi atau gunakan *${prefix}tebakkata* untuk soal baru.`
                            });
                        }
                    }
                    else if (games.mathquiz.active.has(from)) {
                        const game = games.mathquiz.active.get(from);
                        if (Date.now() - game.timestamp > 30000) {
                            await sock.sendMessage(from, { 
                                text: `⏰ *WAKTU HABIS!*\nJawaban: ${game.answer}\n\nGunakan *${prefix}mathquiz* untuk soal baru!`
                            });
                            games.mathquiz.active.delete(from);
                        } else if (parseInt(answer) === game.answer) {
                            await sock.sendMessage(from, { 
                                text: `✅ *BENAR!* 🎉\n${game.question} = ${game.answer}\n\n🧠 Otak encer!`
                            });
                            games.mathquiz.active.delete(from);
                        } else {
                            await sock.sendMessage(from, { 
                                text: `❌ *SALAH!*\nJawabanmu: ${answer}\nCoba lagi!`
                            });
                        }
                    }
                    else if (games.tebakangka.active.has(from)) {
                        const game = games.tebakangka.active.get(from);
                        const guess = parseInt(answer);
                        
                        if (isNaN(guess)) {
                            await sock.sendMessage(from, { 
                                text: '❌ Masukkan angka yang valid (1-100)!'
                            });
                        } else if (guess === game.answer) {
                            await sock.sendMessage(from, { 
                                text: `✅ *BENAR!* 🎉\nAngka ${game.answer} tepat!\n\n🎯 Tebakan mantap!`
                            });
                            games.tebakangka.active.delete(from);
                        } else if (guess < game.answer) {
                            await sock.sendMessage(from, { 
                                text: '📈 *TERLALU RENDAH!*\nAngka saya lebih besar. Coba lagi!'
                            });
                        } else {
                            await sock.sendMessage(from, { 
                                text: '📉 *TERLALU TINGGI!*\nAngka saya lebih kecil. Coba lagi!'
                            });
                        }
                    } else {
                        await sock.sendMessage(from, { 
                            text: `❌ *Tidak ada game aktif!*\nMulai game dengan:\n• ${prefix}tebakkata\n• ${prefix}mathquiz\n• ${prefix}tebakangka`
                        });
                    }
                }
                
                // Fun menu
                else if (command.startsWith('cek')) {
                    const mentioned = msg.message[messageType]?.contextInfo?.mentionedJid?.[0] || sender;
                    const username = mentioned.split('@')[0];
                    const percentage = checkLuck();
                    
                    const funMessages = {
                        cekiman: {
                            title: '🕌 CEK IMAN',
                            message: `@${username} memiliki tingkat keimanan: ${percentage}`,
                            comment: percentage.includes('🎉') ? 'Masha Allah! 💖 Tingkatkan terus!' : 
                                    percentage.includes('😊') ? 'Alhamdulillah, cukup baik!' :
                                    percentage.includes('😐') ? 'Masih bisa ditingkatkan!' :
                                    'Perbanyak ibadah ya! 📿'
                        },
                        cekfemboy: {
                            title: '🌸 CEK FEMBOY',
                            message: `@${username} memiliki kadar femboy: ${percentage}`,
                            comment: percentage.includes('🎉') ? 'UwU sangat femboy! 🌸' : 
                                    percentage.includes('😊') ? 'Ada sedikit femboy dalam dirimu~' :
                                    'Masih normal kok! 😊'
                        },
                        cekfurry: {
                            title: '🐾 CEK FURRY',
                            message: `@${username} memiliki kadar furry: ${percentage}`,
                            comment: percentage.includes('🎉') ? 'Rawr! 🦁 Furry level maksimal!' : 
                                    percentage.includes('😊') ? 'Ada jiwa furry dalam dirimu~' :
                                    'Normal aja kok! 😅'
                        },
                        cekjamet: {
                            title: '🚬 CEK JAMET',
                            message: `@${username} memiliki kadar jamet: ${percentage}`,
                            comment: percentage.includes('🎉') ? 'Woy! 🏍️ Level jamet maksimal!' : 
                                    percentage.includes('😊') ? 'Ada sedikit jiwa jamet~' :
                                    'Alhamdulillah normal! 😇'
                        }
                    };
                    
                    if (funMessages[command]) {
                        const { title, message, comment } = funMessages[command];
                        await sock.sendMessage(from, { 
                            text: `${title}\n\n${message}\n\n💬 ${comment}`,
                            mentions: [mentioned]
                        });
                    }
                }
                
                // Downloader menu
                else if (command.startsWith('playyt')) {
                    const url = args;
                    if (!url) {
                        await sock.sendMessage(from, { 
                            text: '❌ *Format salah!*\nGunakan: *.playyt <link YouTube>*\n\nContoh: .playyt https://youtu.be/example'
                        });
                        return;
                    }
                    
                    await sock.sendMessage(from, { 
                        text: '⏳ *Mendownload audio YouTube...*\nMohon tunggu beberapa saat...'
                    });
                    
                    const audio = await downloadYouTube(url, 'audio');
                    if (audio) {
                        await sock.sendMessage(from, { 
                            audio: { url: audio.url },
                            mimetype: 'audio/mpeg',
                            fileName: `${audio.title.substring(0, 50)}.mp3`,
                            caption: `🎵 *${audio.title}*\n⏱️ Durasi: ${Math.floor(audio.duration / 60)}:${(audio.duration % 60).toString().padStart(2, '0')}\n\n_Downloaded by Windbi Bot_`
                        });
                    } else {
                        await sock.sendMessage(from, { 
                            text: '❌ *Gagal mendownload audio!*\nPastikan link YouTube valid dan video tidak di-private.'
                        });
                    }
                }
                else if (command === 'yt') {
                    const url = args;
                    if (!url) {
                        await sock.sendMessage(from, { 
                            text: '❌ *Format salah!*\nGunakan: *.yt <link YouTube>*\n\nContoh: .yt https://youtu.be/example'
                        });
                        return;
                    }
                    
                    await sock.sendMessage(from, { 
                        text: '⏳ *Mendownload video YouTube...*\nProses ini mungkin memakan waktu...'
                    });
                    
                    const video = await downloadYouTube(url, 'video');
                    if (video) {
                        await sock.sendMessage(from, { 
                            video: { url: video.url },
                            caption: `📹 *${video.title}*\n⏱️ Durasi: ${Math.floor(video.duration / 60)}:${(video.duration % 60).toString().padStart(2, '0')}\n\n_Downloaded by Windbi Bot_`
                        });
                    } else {
                        await sock.sendMessage(from, { 
                            text: '❌ *Gagal mendownload video!*\nPastikan link YouTube valid dan video tidak di-private.'
                        });
                    }
                }
                else if (command === 'ig' || command === 'tt') {
                    const url = args;
                    if (!url) {
                        await sock.sendMessage(from, { 
                            text: `❌ *Format salah!*\nGunakan: *.${command} <link>*\n\nContoh: .${command} https://instagram.com/p/example`
                        });
                        return;
                    }
                    
                    const platform = command === 'ig' ? 'Instagram' : 'TikTok';
                    
                    await sock.sendMessage(from, { 
                        text: `⚠️ *Fitur ${platform} Downloader sedang dalam pengembangan.*\n\nUntuk saat ini, gunakan website downloader:\n\n• ${platform}: https://snapinsta.app\n• TikTok: https://snaptik.app\n\nAtau tunggu update berikutnya!`
                    });
                }
                
                // Admin menu (hanya admin/owner)
                else if (command.startsWith('kick') && isAdmin) {
                    if (!isGroup) {
                        await sock.sendMessage(from, { 
                            text: '❌ *Command ini hanya untuk grup!*'
                        });
                        return;
                    }
                    
                    const mentioned = msg.message[messageType]?.contextInfo?.mentionedJid;
                    if (!mentioned || mentioned.length === 0) {
                        await sock.sendMessage(from, { 
                            text: '❌ *Tag member yang akan di-kick!*\n\nContoh: .kick @member'
                        });
                        return;
                    }
                    
                    for (const user of mentioned) {
                        try {
                            if (user === sock.user.id) {
                                await sock.sendMessage(from, { 
                                    text: '🤖 Saya tidak bisa kick diri sendiri!'
                                });
                                continue;
                            }
                            
                            await sock.groupParticipantsUpdate(from, [user], 'remove');
                            await sock.sendMessage(from, { 
                                text: `✅ @${user.split('@')[0]} telah di-kick dari grup.`,
                                mentions: [user]
                            });
                        } catch (error) {
                            console.error('Error kicking user:', error);
                            await sock.sendMessage(from, { 
                                text: `❌ Gagal kick @${user.split('@')[0]}`
                            });
                        }
                    }
                }
                else if (command.startsWith('ban') && isAdmin) {
                    await sock.sendMessage(from, { 
                        text: '⚠️ *Fitur ban sedang dalam pengembangan.*\n\nGunakan .kick untuk sekarang.'
                    });
                }
                else if (command === 'grup') {
                    if (!isAdmin || !isGroup) {
                        await sock.sendMessage(from, { 
                            text: '❌ *Hanya admin grup yang bisa menggunakan command ini!*'
                        });
                        return;
                    }
                    
                    const action = args.toLowerCase();
                    if (action === 'buka') {
                        await sock.groupSettingUpdate(from, 'not_announcement');
                        await sock.sendMessage(from, { 
                            text: '✅ *Grup dibuka!*\nSekarang semua member bisa mengirim pesan.'
                        });
                    } else if (action === 'tutup') {
                        await sock.groupSettingUpdate(from, 'announcement');
                        await sock.sendMessage(from, { 
                            text: '🔒 *Grup ditutup!*\nHanya admin yang bisa mengirim pesan.'
                        });
                    } else {
                        await sock.sendMessage(from, { 
                            text: '❌ *Format salah!*\nGunakan: *.grup buka* atau *.grup tutup*'
                        });
                    }
                }
                else if (command === 'totag' && isAdmin) {
                    if (!isGroup) {
                        await sock.sendMessage(from, { 
                            text: '❌ *Command ini hanya untuk grup!*'
                        });
                        return;
                    }
                    
                    try {
                        const metadata = await sock.groupMetadata(from);
                        let mentionText = '📢 *TAG ALL MEMBERS*\n\n';
                        const mentions = [];
                        
                        let count = 1;
                        for (const participant of metadata.participants) {
                            if (participant.id !== sock.user.id) {
                                mentionText += `${count}. @${participant.id.split('@')[0]}\n`;
                                mentions.push(participant.id);
                                count++;
                            }
                        }
                        
                        mentionText += `\nTotal: ${metadata.participants.length - 1} member\n_Ditag oleh admin_`;
                        
                        await sock.sendMessage(from, { 
                            text: mentionText,
                            mentions: mentions
                        });
                    } catch (error) {
                        console.error('Error tagging members:', error);
                        await sock.sendMessage(from, { 
                            text: '❌ Gagal tag semua member!'
                        });
                    }
                }
                
                // Owner menu (hanya owner)
                else if (command === 'npm' && isOwner) {
                    const lib = args;
                    if (!lib) {
                        await sock.sendMessage(from, { 
                            text: '❌ *Format salah!*\nGunakan: *.npm <nama library>*\n\nContoh: .npm axios'
                        });
                        return;
                    }
                    
                    try {
                        const response = await axios.get(`https://registry.npmjs.org/${lib}`);
                        const pkg = response.data;
                        
                        await sock.sendMessage(from, { 
                            text: `📦 *NPM Package: ${pkg.name}*\n\n📖 Versi: ${pkg['dist-tags'].latest}\n📝 Deskripsi: ${pkg.description || 'Tidak ada deskripsi'}\n📅 Update: ${pkg.time?.modified || 'Unknown'}\n🏠 Homepage: ${pkg.homepage || 'Tidak ada'}\n\n🔗 https://www.npmjs.com/package/${pkg.name}`
                        });
                    } catch (error) {
                        await sock.sendMessage(from, { 
                            text: `❌ *Package "${lib}" tidak ditemukan!*\nCek penulisan atau library tidak terdaftar di NPM.`
                        });
                    }
                }
                else if (command === 'gclone' && isOwner) {
                    const url = args;
                    if (!url) {
                        await sock.sendMessage(from, { 
                            text: '❌ *Format salah!*\nGunakan: *.gclone <link GitHub>*\n\nContoh: .gclone https://github.com/humpreydev-hash/windbi-botm'
                        });
                        return;
                    }
                    
                    await sock.sendMessage(from, { 
                        text: `⚠️ *Fitur git clone hanya tersedia di VPS/Local.*\n\nUntuk clone di terminal:\n\`\`\`bash\ngit clone ${url}\n\`\`\`\n\nAtau download manual dari GitHub.`
                    });
                }
                else if (command === 'apistatus' && isOwner) {
                    const apiStatus = await checkAPIs();
                    await sock.sendMessage(from, { 
                        text: apiStatus
                    });
                }
                else if (command === 'restart' && isOwner) {
                    await sock.sendMessage(from, { 
                        text: '🔄 *Restarting bot...*\nBot akan restart dalam 3 detik...'
                    });
                    setTimeout(() => {
                        console.log('Restarting bot by owner command...');
                        process.exit(0);
                    }, 3000);
                }
                
                // Jika command tidak dikenali
                else if (textLower.startsWith(prefix)) {
                    await sock.sendMessage(from, { 
                        text: `❌ *Command "${command}" tidak dikenali!*\n\nKetik *${prefix}menu* untuk melihat daftar command.\nAtau tag bot untuk bantuan.`
                    });
                }
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    });
    
    // Auto-reply jika bot di-mention
    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;
            
            const messageType = Object.keys(msg.message)[0];
            const from = msg.key.remoteJid;
            const botJid = sock.user.id;
            
            // Cek jika bot di-mention
            const mentioned = msg.message[messageType]?.contextInfo?.mentionedJid?.includes(botJid);
            
            if (mentioned && !msg.key.fromMe) {
                const menu = await createMenu();
                await sock.sendMessage(from, { 
                    text: `👋 *Hai! Saya Windbi Bot! 🤖*\n\nBot WhatsApp multifungsi oleh *humpreyDev*\n\n${menu}\n\n⚡ Tag saya atau ketik *${prefix}menu* untuk memulai!`
                });
            }
        } catch (error) {
            console.error('Error handling mention:', error);
        }
    });
    
    // Periodic status update
    setInterval(async () => {
        try {
            const stats = await getSystemStats();
            console.log(`📊 Status: Online | Uptime: ${stats.uptime} | RAM: ${stats.ram.split(' / ')[0]}`);
        } catch (error) {
            console.error('Error updating status:', error);
        }
    }, 60000); // Every minute
}

// Start bot
console.log('╔═══════════════════════════════════════╗');
console.log('║         🚀 WINDIBI BOT v2.0           ║');
console.log('║       WhatsApp Bot by humpreyDev      ║');
console.log('╚═══════════════════════════════════════╝');
console.log(`📅 ${moment().tz('Asia/Jakarta').format('DD/MM/YYYY HH:mm:ss')}`);
console.log(`🔧 Node.js ${process.version}`);
console.log(`📱 Owner: ${ownerNumber}`);
console.log(`🏠 Directory: ${process.cwd()}`);
console.log('═════════════════════════════════════════');

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('⚠️ Uncaught Exception:', error.message);
    console.error(error.stack);
});

process.on('unhandledRejection', (error) => {
    console.error('⚠️ Unhandled Rejection:', error.message);
});

// Start the bot
startBot().catch(error => {
    console.error('❌ Failed to start bot:', error);
    console.error(error.stack);
    console.log('🔄 Restarting in 10 seconds...');
    setTimeout(() => {
        process.exit(1);
    }, 10000);
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n🛑 Bot dimatikan oleh user...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Bot dimatikan oleh sistem...');
    process.exit(0);
});
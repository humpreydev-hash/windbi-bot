const { default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    Browsers,
    makeInMemoryStore,
    fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const os = require('os');
const axios = require('axios');
const ytdl = require('ytdl-core');
const yts = require('yt-search');
const { exec } = require('child_process');
const util = require('util');
const moment = require('moment-timezone');

const execAsync = util.promisify(exec);
let store = makeInMemoryStore({ logger: { level: 'silent' } });

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

// Fungsi untuk mendapatkan statistik sistem (versi sederhana)
async function getSystemStats() {
    try {
        const cpus = os.cpus();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        
        // Cek disk space menggunakan command
        let diskInfo = 'Tidak tersedia';
        try {
            if (process.platform === 'win32') {
                const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption');
                diskInfo = stdout.split('\n')[1] || 'Windows disk';
            } else {
                const { stdout } = await execAsync('df -h /');
                diskInfo = stdout.split('\n')[1] || 'Unix disk';
            }
        } catch (diskError) {
            diskInfo = 'Error getting disk info';
        }
        
        return {
            cpu: `${cpus[0].model} ${cpus.length} cores`,
            ram: `${(usedMem / 1024 / 1024 / 1024).toFixed(2)}GB / ${(totalMem / 1024 / 1024 / 1024).toFixed(2)}GB`,
            disk: diskInfo.substring(0, 30) + '...'
        };
    } catch (error) {
        console.error('Error getting system stats:', error);
        return {
            cpu: os.cpus()[0]?.model || 'Unknown',
            ram: 'Unknown',
            disk: 'Unknown'
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
        { name: 'NPM', url: 'https://registry.npmjs.org' }
    ];
    
    let result = '╭╼━⧼ 𝗔𝗣𝗜 𝗦𝗧𝗔𝗧𝗨𝗦 ⧽━╾❐\n';
    
    for (const api of apis) {
        try {
            const response = await axios.get(api.url, { timeout: 5000 });
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
            thumbnail: info.videoDetails.thumbnails[0].url
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
    return `${random}%`;
}

// Main function
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
        version,
        logger: { level: 'silent' },
        printQRInTerminal: false,
        auth: state,
        browser: Browsers.ubuntu('Chrome')
    });
    
    store.bind(sock.ev);
    
    // Generate QR Code
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('Scan QR Code ini dengan WhatsApp:');
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('Koneksi terputus, mencoba reconnect...');
                startBot();
            }
        } else if (connection === 'open') {
            console.log('Bot terhubung!');
            // Send message to owner when bot starts
            const ownerJid = ownerNumber.includes('-') ? ownerNumber : `${ownerNumber}@s.whatsapp.net`;
            await sock.sendMessage(ownerJid, { text: '🤖 *Windbi Bot Aktif!*\nBot sudah online dan siap digunakan!' });
        }
    });
    
    // Save credentials
    sock.ev.on('creds.update', saveCreds);
    
    // Handle messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        
        const messageType = Object.keys(msg.message)[0];
        let text = '';
        
        if (messageType === 'conversation') {
            text = msg.message.conversation.toLowerCase();
        } else if (messageType === 'extendedTextMessage') {
            text = msg.message.extendedTextMessage.text.toLowerCase();
        }
        
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
        if (text.startsWith(prefix)) {
            const command = text.replace(prefix, '').split(' ')[0].trim();
            const args = text.slice(text.indexOf(' ') + 1).trim();
            
            console.log(`Command: ${command} from ${sender}`);
            
            // Menu utama
            if (command === 'menu') {
                const menu = await createMenu();
                await sock.sendMessage(from, { text: menu });
            }
            
            // Public menu
            else if (command === 'verify') {
                await sock.sendMessage(from, { 
                    text: '✅ *Verifikasi Berhasil!*\nAnda telah terverifikasi sebagai pengguna Windbi Bot.'
                });
            }
            else if (command === 'link') {
                await sock.sendMessage(from, { 
                    text: '🔗 *Link Penting:*\n• GitHub: https://github.com/humpreydev-hash\n• Repository: https://github.com/humpreydev-hash/windbi-botm'
                });
            }
            else if (command === 'gig') {
                await sock.sendMessage(from, { 
                    text: '💼 *Gig Services:*\n• Bot Development\n• Web Development\n• API Integration\n• Automation Scripts\n\nHubungi owner untuk order!'
                });
            }
            else if (command === 'github') {
                await sock.sendMessage(from, { 
                    text: '👨‍💻 *GitHub Repository:*\nhttps://github.com/humpreydev-hash/windbi-botm\n\nJangan lupa kasih star ⭐ ya!'
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
                    text: `🎮 *TEBAK KATA*\n\nPertanyaan: "${randomQ.q}"\n\nJawab dengan format: *${prefix}jawab [jawaban]*`
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
                    text: `🧮 *MATH QUIZ*\n\nSoal: ${num1} ${op} ${num2} = ?\n\nJawab dengan format: *${prefix}jawab [angka]*`
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
                    text: `🔢 *TEBAK ANGKA*\n\nSaya memikirkan angka antara 1-100\n\nTebak dengan format: *${prefix}jawab [angka]*`
                });
            }
            else if (command.startsWith('jawab')) {
                const answer = args.toLowerCase();
                
                if (games.tebakkata.active.has(from)) {
                    const game = games.tebakkata.active.get(from);
                    if (answer === game.answer) {
                        await sock.sendMessage(from, { 
                            text: `✅ *BENAR!*\nJawaban "${game.answer}" tepat! 🎉`
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
                    if (parseInt(answer) === game.answer) {
                        await sock.sendMessage(from, { 
                            text: `✅ *BENAR!*\n${game.question} = ${game.answer} 🎉`
                        });
                        games.mathquiz.active.delete(from);
                    } else {
                        await sock.sendMessage(from, { 
                            text: `❌ *SALAH!*\nCoba lagi atau gunakan *${prefix}mathquiz* untuk soal baru.`
                        });
                    }
                }
                else if (games.tebakangka.active.has(from)) {
                    const game = games.tebakangka.active.get(from);
                    const guess = parseInt(answer);
                    
                    if (isNaN(guess)) {
                        await sock.sendMessage(from, { 
                            text: '❌ Masukkan angka yang valid!'
                        });
                    } else if (guess === game.answer) {
                        await sock.sendMessage(from, { 
                            text: `✅ *BENAR!*\nAngka ${game.answer} tepat! 🎉`
                        });
                        games.tebakangka.active.delete(from);
                    } else if (guess < game.answer) {
                        await sock.sendMessage(from, { 
                            text: '📈 *TERLALU RENDAH!*\nAngka saya lebih besar.'
                        });
                    } else {
                        await sock.sendMessage(from, { 
                            text: '📉 *TERLALU TINGGI!*\nAngka saya lebih kecil.'
                        });
                    }
                }
            }
            
            // Fun menu
            else if (command.startsWith('cek')) {
                const mention = msg.message[messageType]?.contextInfo?.mentionedJid?.[0] || sender;
                const username = mention.split('@')[0];
                const percentage = checkLuck();
                
                if (command === 'cekiman') {
                    await sock.sendMessage(from, { 
                        text: `🕌 *CEK IMAN*\n\n@${username} memiliki tingkat keimanan: ${percentage}\n${percentage > 70 ? 'Masha Allah! 💖' : 'Perbanyak ibadah ya!'}`
                    }, { mentions: [mention] });
                }
                else if (command === 'cekfemboy') {
                    await sock.sendMessage(from, { 
                        text: `🌸 *CEK FEMBOY*\n\n@${username} memiliki kadar femboy: ${percentage}\n${percentage > 70 ? 'UwU sangat femboy! 🌸' : 'Masih normal kok!'}`
                    }, { mentions: [mention] });
                }
                else if (command === 'cekfurry') {
                    await sock.sendMessage(from, { 
                        text: `🐾 *CEK FURRY*\n\n@${username} memiliki kadar furry: ${percentage}\n${percentage > 70 ? 'Rawr! 🦁' : 'Biasa aja!'}`
                    }, { mentions: [mention] });
                }
                else if (command === 'cekjamet') {
                    await sock.sendMessage(from, { 
                        text: `🚬 *CEK JAMET*\n\n@${username} memiliki kadar jamet: ${percentage}\n${percentage > 70 ? 'Woy! 🏍️' : 'Alhamdulillah normal!'}`
                    }, { mentions: [mention] });
                }
            }
            
            // Downloader menu
            else if (command.startsWith('playyt')) {
                const url = args;
                if (!url) {
                    await sock.sendMessage(from, { 
                        text: '❌ *Format salah!*\nGunakan: *.playyt <link YouTube>*'
                    });
                    return;
                }
                
                await sock.sendMessage(from, { 
                    text: '⏳ *Mendownload audio YouTube...*'
                });
                
                const audio = await downloadYouTube(url, 'audio');
                if (audio) {
                    await sock.sendMessage(from, { 
                        audio: { url: audio.url },
                        mimetype: 'audio/mpeg',
                        fileName: `${audio.title}.mp3`
                    });
                } else {
                    await sock.sendMessage(from, { 
                        text: '❌ *Gagal mendownload audio!*'
                    });
                }
            }
            else if (command === 'yt') {
                const url = args;
                if (!url) {
                    await sock.sendMessage(from, { 
                        text: '❌ *Format salah!*\nGunakan: *.yt <link YouTube>*'
                    });
                    return;
                }
                
                await sock.sendMessage(from, { 
                    text: '⏳ *Mendownload video YouTube...*'
                });
                
                const video = await downloadYouTube(url, 'video');
                if (video) {
                    await sock.sendMessage(from, { 
                        video: { url: video.url },
                        caption: `📹 *${video.title}*\nDurasi: ${Math.floor(video.duration / 60)}:${video.duration % 60}`
                    });
                } else {
                    await sock.sendMessage(from, { 
                        text: '❌ *Gagal mendownload video!*'
                    });
                }
            }
            else if (command === 'ig') {
                const url = args;
                if (!url) {
                    await sock.sendMessage(from, { 
                        text: '❌ *Format salah!*\nGunakan: *.ig <link Instagram>*'
                    });
                    return;
                }
                
                await sock.sendMessage(from, { 
                    text: '⚠️ *Fitur Instagram Downloader sedang dalam pengembangan.*\n\nUntuk saat ini, gunakan website:\n• https://snapinsta.app\n• https://downloadgram.org'
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
                        text: '❌ *Tag member yang akan di-kick!*'
                    });
                    return;
                }
                
                for (const user of mentioned) {
                    try {
                        await sock.groupParticipantsUpdate(from, [user], 'remove');
                        await sock.sendMessage(from, { 
                            text: `✅ @${user.split('@')[0]} telah di-kick dari grup.`,
                            mentions: [user]
                        });
                    } catch (error) {
                        console.error('Error kicking user:', error);
                    }
                }
            }
            else if (command.startsWith('ban') && isAdmin) {
                await sock.sendMessage(from, { 
                    text: '⚠️ *Fitur ban sedang dalam pengembangan.*'
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
                    let mentionText = '';
                    const mentions = [];
                    
                    for (const participant of metadata.participants) {
                        mentionText += `@${participant.id.split('@')[0]} `;
                        mentions.push(participant.id);
                    }
                    
                    await sock.sendMessage(from, { 
                        text: `📢 *TAG ALL MEMBERS*\n\n${mentionText}\n\n_Ditag oleh admin_`,
                        mentions: mentions
                    });
                } catch (error) {
                    console.error('Error tagging members:', error);
                }
            }
            
            // Owner menu (hanya owner)
            else if (command === 'npm' && isOwner) {
                const lib = args;
                if (!lib) {
                    await sock.sendMessage(from, { 
                        text: '❌ *Format salah!*\nGunakan: *.npm <nama library>*'
                    });
                    return;
                }
                
                try {
                    const response = await axios.get(`https://registry.npmjs.org/${lib}`);
                    const pkg = response.data;
                    
                    await sock.sendMessage(from, { 
                        text: `📦 *NPM Package: ${pkg.name}*\n\n📖 Versi: ${pkg['dist-tags'].latest}\n📝 Deskripsi: ${pkg.description || 'Tidak ada deskripsi'}\n🏠 Homepage: ${pkg.homepage || 'Tidak ada'}\n\n🔗 https://www.npmjs.com/package/${pkg.name}`
                    });
                } catch (error) {
                    await sock.sendMessage(from, { 
                        text: `❌ *Package "${lib}" tidak ditemukan!*`
                    });
                }
            }
            else if (command === 'gclone' && isOwner) {
                const url = args;
                if (!url) {
                    await sock.sendMessage(from, { 
                        text: '❌ *Format salah!*\nGunakan: *.gclone <link GitHub>*'
                    });
                    return;
                }
                
                await sock.sendMessage(from, { 
                    text: '⚠️ *Fitur git clone tidak tersedia di lingkungan terbatas.*\n\nUntuk clone repository, gunakan command:\n```bash\ngit clone ' + url + '\n```'
                });
            }
            else if (command === 'apistatus' && isOwner) {
                const apiStatus = await checkAPIs();
                await sock.sendMessage(from, { 
                    text: apiStatus
                });
            }
            
            // Jika command tidak dikenali
            else if (text.startsWith(prefix)) {
                await sock.sendMessage(from, { 
                    text: `❌ *Command tidak dikenali!*\nKetik *${prefix}menu* untuk melihat daftar command.`
                });
            }
        }
    });
    
    // Auto-reply jika bot di-mention
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;
        
        const messageType = Object.keys(msg.message)[0];
        const from = msg.key.remoteJid;
        const botJid = sock.user.id;
        
        // Cek jika bot di-mention
        const mentioned = msg.message[messageType]?.contextInfo?.mentionedJid?.includes(botJid);
        
        if (mentioned && !msg.key.fromMe) {
            const menu = await createMenu();
            await sock.sendMessage(from, { 
                text: `👋 *Hai! Saya Windbi Bot!*\n\n${menu}\n\nTag saya atau ketik *${prefix}menu* untuk memulai!`
            });
        }
    });
}

// Start bot
console.log('🚀 Starting Windbi Bot...');
console.log('📱 Owner: ' + ownerNumber);
console.log('🔧 Node.js ' + process.version);
console.log('⏰ ' + moment().tz('Asia/Jakarta').format('DD/MM/YYYY HH:mm:ss'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});

// Start the bot
startBot().catch(error => {
    console.error('Failed to start bot:', error);
    process.exit(1);
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n🛑 Bot dimatikan...');
    process.exit(0);
});
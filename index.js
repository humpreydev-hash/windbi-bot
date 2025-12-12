// Lanjutan dari npmCommand...
    const packageQuery = text.split(' ')[1];
    if (!packageQuery) return sock.sendMessage(message.key.remoteJid, { text: 'Masukkan nama package NPM!\nContoh: .npm baileys' });

    try {
        const { data } = await axios.get(`https://registry.npmjs.org/${packageQuery}`, { timeout: 10000 });
        const latest = data['dist-tags'].latest;
        const versionData = data.versions[latest];
        
        const resultText = `*NPM Package Info*\n\n📦 *Nama:* ${data.name}\nv *Versi:* ${latest}\n📜 *Deskripsi:* ${data.description || '-'}\nsed *Lisensi:* ${data.license || '-'}\n👤 *Author:* ${data.author?.name || '-'}\n🏠 *Homepage:* ${data.homepage || '-'}`;
        
        await sock.sendMessage(message.key.remoteJid, { text: resultText });
    } catch (error) {
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Package tidak ditemukan.' });
    }
}

// 16. Fitur Cek (Fun)
async function cekFunCommand(sock, message, text, type) {
    const mentions = parseMention(text);
    const target = mentions.length > 0 ? mentions[0] : (message.key.participant || message.key.remoteJid);
    const percentage = Math.floor(Math.random() * 101);
    
    let title = '';
    switch(type) {
        case 'iman': title = 'Tingkat Keimanan'; break;
        case 'femboy': title = 'Tingkat Femboy'; break;
        case 'furry': title = 'Tingkat Furry'; break;
        case 'jamet': title = 'Tingkat Kejametan'; break;
    }
    
    await sock.sendMessage(message.key.remoteJid, {
        text: `📊 *${title}*\nTarget: @${target.split('@')[0]}\nHasil: ${percentage}%`,
        mentions: [target]
    });
}

// 17. Game: Tebak Kata
async function tebakkataCommand(sock, message) {
    const chatId = message.key.remoteJid;
    if (activeGames[chatId]) return sock.sendMessage(chatId, { text: 'Masih ada game yang berjalan di chat ini!' });
    
    const index = Math.floor(Math.random() * tebakkataData.length);
    const soal = tebakkataData[index];
    
    activeGames[chatId] = {
        type: 'tebakkata',
        jawaban: soal.jawab.toLowerCase(),
        waktu: setTimeout(() => {
            if (activeGames[chatId]) {
                sock.sendMessage(chatId, { text: `Waktu habis! Jawabannya adalah: *${soal.jawab}*` });
                delete activeGames[chatId];
            }
        }, 60000) // 60 detik
    };
    
    await sock.sendMessage(chatId, { text: `🎮 *TEBAK KATA*\n\nPetunjuk: ${soal.soal}\n\nWaktu: 60 detik!` });
}

// 18. Game: Math Quiz
async function mathquizCommand(sock, message) {
    const chatId = message.key.remoteJid;
    if (activeGames[chatId]) return sock.sendMessage(chatId, { text: 'Masih ada game yang berjalan di chat ini!' });
    
    const a = Math.floor(Math.random() * 50);
    const b = Math.floor(Math.random() * 50);
    const ops = ['+', '-', '*'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    const result = eval(`${a} ${op} ${b}`);
    
    activeGames[chatId] = {
        type: 'math',
        jawaban: result.toString(),
        waktu: setTimeout(() => {
            if (activeGames[chatId]) {
                sock.sendMessage(chatId, { text: `Waktu habis! Jawabannya adalah: *${result}*` });
                delete activeGames[chatId];
            }
        }, 30000)
    };
    
    await sock.sendMessage(chatId, { text: `🧠 *MATH QUIZ*\n\nBerapa hasil dari: ${a} ${op} ${b}?\n\nWaktu: 30 detik!` });
}

// 19. Game: Tebak Angka
async function tebakangkaCommand(sock, message) {
    const chatId = message.key.remoteJid;
    if (activeGames[chatId]) return sock.sendMessage(chatId, { text: 'Masih ada game yang berjalan di chat ini!' });
    
    const angka = Math.floor(Math.random() * 10) + 1; // 1-10 biar gampang
    
    activeGames[chatId] = {
        type: 'tebakangka',
        jawaban: angka.toString(),
        waktu: setTimeout(() => {
            if (activeGames[chatId]) {
                sock.sendMessage(chatId, { text: `Waktu habis! Angkanya adalah: *${angka}*` });
                delete activeGames[chatId];
            }
        }, 30000)
    };
    
    await sock.sendMessage(chatId, { text: `🔢 *TEBAK ANGKA*\n\nTebak angka dari 1 sampai 10!\n\nWaktu: 30 detik!` });
}

// --- MAIN HANDLER (Logic Utama) ---
async function handleMessage(sock, message) {
    try {
        if (!message.message) return;
        
        const msgType = Object.keys(message.message)[0];
        const chatId = message.key.remoteJid;
        const senderJid = message.key.participant || chatId;
        const isMe = message.key.fromMe;
        
        // Skip pesan status/broadcast
        if (chatId === 'status@broadcast') return;
        
        // Ekstrak text body
        let body = extractMessageText(message);
        if (!body) return;
        
        // Auto Verify Owner (Prioritas)
        await autoVerifyOwner(senderJid);
        
        // --- LOGIC JAWABAN GAME ---
        if (activeGames[chatId]) {
            const game = activeGames[chatId];
            if (body.toLowerCase() === game.jawaban) {
                clearTimeout(game.waktu);
                delete activeGames[chatId];
                await sock.sendMessage(chatId, { text: `🎉 *BENAR!*\nSelamat @${senderJid.split('@')[0]} berhasil menjawab!`, mentions: [senderJid] }, { quoted: message });
                return;
            }
        }

        // Cek Prefix
        if (!body.startsWith(botPrefix)) return;
        
        const command = body.slice(botPrefix.length).trim().split(' ')[0].toLowerCase();
        const text = body.slice(botPrefix.length + command.length).trim();
        
        console.log(`Command: ${command} from ${senderJid} in ${chatId}`);

        // Cek Self Mode
        if (selfMode && !isOwner(senderJid)) return;

        // Cek Verifikasi (Kecuali command verify & help & menu)
        if (!['verify', 'menu', 'help'].includes(command)) {
            const verified = await isUserVerified(senderJid);
            if (!verified) {
                return sock.sendMessage(chatId, { text: '⚠️ Kamu belum terverifikasi.\nKetik *.verify* untuk mulai menggunakan bot.' });
            }
        }

        // --- SWITCH COMMAND ---
        switch (command) {
            case 'menu':
            case 'help':
                await showMenu(sock, message);
                break;
                
            case 'verify':
                await verifyCommand(sock, message);
                break;
                
            case 'self':
                await selfCommand(sock, message);
                break;
                
            case 'unself':
                await unselfCommand(sock, message);
                break;

            // Downloader
            case 'tiktok':
            case 'tt':
                await tiktokCommand(sock, message, body);
                break;
            case 'ig':
            case 'instagram':
                await igCommand(sock, message, body);
                break;
            case 'yt':
            case 'youtube':
                await ytCommand(sock, message, body);
                break;
            case 'stiker':
            case 's':
            case 'sticker':
                await stikerCommand(sock, message, text);
                break;
            case 'tostiker':
            case 'tosticker':
                await tostikerCommand(sock, message);
                break;
            case 'tomedia':
            case 'toimg':
                await tomediaCommand(sock, message);
                break;

            // Group
            case 'grup':
            case 'group':
                await grupCommand(sock, message, text);
                break;
            case 'totag':
            case 'tagall':
                await totagCommand(sock, message, text);
                break;
            case 'kick':
                await kickCommand(sock, message, text);
                break;
            case 'ban':
                await banCommand(sock, message, text);
                break;

            // Info
            case 'github':
            case 'gh':
                await githubCommand(sock, message, body);
                break;
            case 'npm':
                await npmCommand(sock, message, body);
                break;

            // Fun Checks
            case 'cekiman':
                await cekFunCommand(sock, message, text, 'iman');
                break;
            case 'cekfemboy':
                await cekFunCommand(sock, message, text, 'femboy');
                break;
            case 'cekfurry':
                await cekFunCommand(sock, message, text, 'furry');
                break;
            case 'cekjamet':
                await cekFunCommand(sock, message, text, 'jamet');
                break;

            // Games
            case 'tebakkata':
                await tebakkataCommand(sock, message);
                break;
            case 'mathquiz':
            case 'math':
                await mathquizCommand(sock, message);
                break;
            case 'tebakangka':
                await tebakangkaCommand(sock, message);
                break;

            // Owner Tools
            case 'apistatus':
                if (!isOwner(senderJid)) return;
                await sock.sendMessage(chatId, { text: '✅ API Status: Online' });
                break;
            case 'log':
                if (!isOwner(senderJid)) return;
                await sock.sendMessage(chatId, { text: '✅ System berjalan normal.' });
                break;
                
            default:
                // Command tidak dikenal, abaikan
                break;
        }

    } catch (error) {
        console.error('Error in message handler:', error);
    }
}

// --- KONEKSI UTAMA ---
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(authPath);

    const sock = makeWASocket({
        printQRInTerminal: true,
        auth: state,
        logger: {
            level: 'silent'
        },
        browser: ["WindBi Bot", "Chrome", "1.0.0"]
    });

    // Handle Connection Update
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('SCAN QR CODE INI UNTUK LOGIN:');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)
                ? lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut
                : true;
            
            console.log('Koneksi terputus. Reconnecting:', shouldReconnect);
            
            if (shouldReconnect) {
                startBot();
            } else {
                console.log('Session Logout. Hapus folder auth dan scan ulang.');
            }
        } else if (connection === 'open') {
            console.log('✅ Bot berhasil terhubung ke WhatsApp!');
            
            // Kirim pesan notif ke owner
            const cleanOwner = ownerNumber.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            try {
                await sock.sendMessage(cleanOwner, { text: '🤖 WindBi Bot telah aktif dan terhubung!' });
            } catch (e) {}
        }
    });

    // Handle Creds Update
    sock.ev.on('creds.update', saveCreds);

    // Handle Incoming Messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type === 'notify') {
            for (const msg of messages) {
                await handleMessage(sock, msg);
            }
        }
    });
}

// --- START ---
startBot().catch(err => console.error('Error starting bot:', err));
console.log('🚀 WhatsApp Bot Starting...');

// Fix untuk Railway
if (typeof global.crypto === 'undefined') {
    global.crypto = require('crypto');
}
if (typeof global.WebSocket === 'undefined') {
    global.WebSocket = require('ws');
}

const fs = require('fs');
const path = require('path');
const { Boom } = require('@hapi/boom');

// Buat folder session
const sessionDir = './session';
if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

// Delay import untuk hindari crash
setTimeout(async () => {
    try {
        console.log('📦 Loading WhatsApp library...');
        
        // Pakai require yang lebih compatible
        const makeWASocket = require('@adiwajshing/baileys').default;
        const { 
            useMultiFileAuthState, 
            DisconnectReason,
            makeInMemoryStore,
            delay 
        } = require('@adiwajshing/baileys');
        
        const qrcode = require('qrcode-terminal');
        
        console.log('✅ Libraries loaded');
        
        // Store untuk pesan
        const store = makeInMemoryStore({ });
        
        async function startWhatsAppBot() {
            console.log('🔄 Initializing connection...');
            
            try {
                // Load session
                const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
                
                console.log('📁 Session loaded from:', sessionDir);
                
                // Buat socket dengan config khusus
                const sock = makeWASocket({
                    auth: state,
                    printQRInTerminal: false, // Kita handle sendiri
                    logger: { level: 'silent' }, // Kurangi log
                    browser: ['Ubuntu', 'Chrome', '110.0.5481.100'],
                    connectTimeoutMs: 60000,
                    keepAliveIntervalMs: 25000,
                    defaultQueryTimeoutMs: 0,
                    emitOwnEvents: true,
                    generateHighQualityLinkPreview: true,
                    syncFullHistory: false,
                    markOnlineOnConnect: false,
                    retryRequestDelayMs: 250,
                    fireInitQueries: true,
                    txTimeout: 20000,
                    qrTimeout: 45000
                });
                
                // Bind store
                store.bind(sock.ev);
                
                // QR Code Handler
                sock.ev.on('connection.update', async (update) => {
                    const { connection, lastDisconnect, qr } = update;
                    
                    // Tampilkan QR Code
                    if (qr) {
                        console.log('\n══════════════════════════════════════');
                        console.log('📱 SCAN QR CODE INI DENGAN WHATSAPP:');
                        console.log('1. Buka WhatsApp di HP');
                        console.log('2. Tap titik tiga (⋮)');
                        console.log('3. Pilih "Linked Devices"');
                        console.log('4. Tap "Link a Device"');
                        console.log('5. Scan QR code dibawah ini');
                        console.log('══════════════════════════════════════\n');
                        qrcode.generate(qr, { small: true });
                        console.log('\n══════════════════════════════════════\n');
                        
                        // Simpan QR ke file (untuk backup)
                        fs.writeFileSync(
                            path.join(sessionDir, 'qr.txt'), 
                            qr + '\n' + new Date().toISOString()
                        );
                    }
                    
                    // Handle connection status
                    if (connection === 'open') {
                        console.log('✅✅✅ CONNECTED TO WHATSAPP! ✅✅✅');
                        console.log(`🤖 User: ${sock.user?.name || 'Unknown'}`);
                        console.log(`📱 Number: ${sock.user?.id || 'Unknown'}`);
                        
                        // Send welcome message to self
                        if (sock.user?.id) {
                            const selfJid = sock.user.id;
                            setTimeout(async () => {
                                try {
                                    await sock.sendMessage(selfJid, {
                                        text: '🤖 *BOT AKTIF*\nBot berhasil terhubung di Railway!\n\nKetik `.menu` untuk melihat command.'
                                    });
                                    console.log('📤 Welcome message sent');
                                } catch (e) {
                                    console.log('⚠️  Failed to send welcome:', e.message);
                                }
                            }, 2000);
                        }
                    }
                    
                    if (connection === 'close') {
                        console.log('❌ Connection closed');
                        
                        const statusCode = lastDisconnect?.error?.output?.statusCode;
                        const error = lastDisconnect?.error;
                        
                        console.log('Last disconnect:', {
                            statusCode,
                            error: error?.message,
                            reason: error?.output?.payload?.error
                        });
                        
                        // Auto reconnect logic
                        const shouldReconnect = 
                            statusCode !== DisconnectReason.loggedOut &&
                            statusCode !== 405 && // Method Not Allowed
                            statusCode !== 403; // Forbidden
                        
                        console.log('Should reconnect:', shouldReconnect);
                        
                        if (shouldReconnect) {
                            console.log('🔄 Reconnecting in 5 seconds...');
                            await delay(5000);
                            startWhatsAppBot();
                        } else {
                            console.log('🛑 Cannot reconnect, need new QR');
                            if (statusCode === 405) {
                                console.log('⚠️  ERROR 405: Session mungkin corrupt');
                                console.log('💡 Coba hapus folder session dan scan QR lagi');
                            }
                        }
                    }
                    
                    // Connection errors
                    if (update.connection === 'connecting') {
                        console.log('🔄 Connecting to WhatsApp servers...');
                    }
                });
                
                // Save credentials
                sock.ev.on('creds.update', saveCreds);
                
                // Message handler
                sock.ev.on('messages.upsert', async ({ messages }) => {
                    try {
                        const msg = messages[0];
                        
                        // Skip jika dari bot sendiri atau bukan pesan baru
                        if (msg.key.fromMe || msg.status) return;
                        
                        const jid = msg.key.remoteJid;
                        const text = extractMessageText(msg);
                        const senderName = msg.pushName || 'User';
                        
                        console.log(`📨 [${senderName}]: ${text.substring(0, 50)}...`);
                        
                        // Simple command handler
                        if (text) {
                            const command = text.toLowerCase().trim();
                            
                            // Ping
                            if (command === '.ping' || command === '!ping') {
                                await sock.sendMessage(jid, { 
                                    text: `🏓 Pong! ${senderName}\nBot aktif di Railway!` 
                                });
                            }
                            
                            // Menu
                            else if (command === '.menu' || command === '!menu') {
                                const menu = `📱 *BOT MENU*
                                
▫️ .ping - Test bot
▫️ .menu - Menu ini
▫️ .info - Info bot
▫️ .time - Waktu sekarang
▫️ .owner - Pembuat bot
                                
📌 _Kirim .help untuk bantuan_`;
                                await sock.sendMessage(jid, { text: menu });
                            }
                            
                            // Info
                            else if (command === '.info' || command === '!info') {
                                const info = `🤖 *BOT INFORMATION*
                                
• Platform: Railway
• Runtime: Node.js ${process.version}
• Library: Baileys
• Status: Active
• Uptime: ${process.uptime().toFixed(0)}s
                                
_Made with ❤️ for WhatsApp_`;
                                await sock.sendMessage(jid, { text: info });
                            }
                            
                            // Time
                            else if (command === '.time' || command === '!time') {
                                const now = new Date();
                                const timeStr = `⏰ *WAKTU SAAT INI*
                                
📅 Tanggal: ${now.toLocaleDateString('id-ID')}
🕐 Jam: ${now.toLocaleTimeString('id-ID')}
🌐 Zona: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
                                await sock.sendMessage(jid, { text: timeStr });
                            }
                            
                            // Help
                            else if (command === '.help' || command === '!help') {
                                await sock.sendMessage(jid, { 
                                    text: `🆘 *BANTUAN*
                                    
Bot WhatsApp sederhana untuk Railway.
                                    
➤ Ketik .menu untuk melihat semua command
➤ Bot akan merespon pesan dengan prefix . atau !
➤ Untuk masalah, hapus folder session dan scan QR lagi
                                    
_Semua command case-insensitive_` 
                                });
                            }
                            
                            // Hai/Halo
                            else if (command === 'hai' || command === 'halo' || command === 'hello') {
                                await sock.sendMessage(jid, { 
                                    text: `Halo juga ${senderName}! 👋\nKetik .menu untuk melihat command yang tersedia.` 
                                });
                            }
                            
                            // Unknown command
                            else if (command.startsWith('.') || command.startsWith('!')) {
                                await sock.sendMessage(jid, { 
                                    text: `❓ Command "${command}" tidak dikenali.\nKetik .menu untuk melihat daftar command.` 
                                });
                            }
                        }
                        
                    } catch (error) {
                        console.log('Error handling message:', error.message);
                    }
                });
                
                // Connection error handling
                sock.ev.on('connection.update', ({ lastDisconnect }) => {
                    if (lastDisconnect?.error) {
                        const error = lastDisconnect.error;
                        console.log('Connection error:', {
                            message: error.message,
                            statusCode: error.output?.statusCode,
                            error: error.output?.payload?.error
                        });
                    }
                });
                
                // Handle WhatsApp Web events
                sock.ev.on('messaging-history.set', () => {
                    console.log('📜 Messaging history loaded');
                });
                
                sock.ev.on('chats.set', () => {
                    console.log('💬 Chats loaded');
                });
                
                // Periodic log to keep Railway alive
                setInterval(() => {
                    const now = new Date();
                    console.log(`❤️  Bot still running: ${now.toLocaleTimeString('id-ID')}`);
                }, 60000); // Setiap 1 menit
                
            } catch (error) {
                console.log('❌ Error in startWhatsAppBot:', error.message);
                console.log('Stack:', error.stack);
                
                // Restart setelah 10 detik
                setTimeout(() => {
                    console.log('🔄 Restarting bot...');
                    startWhatsAppBot();
                }, 10000);
            }
        }
        
        // Helper function
        function extractMessageText(msg) {
            if (msg.message?.conversation) return msg.message.conversation;
            if (msg.message?.extendedTextMessage?.text) return msg.message.extendedTextMessage.text;
            if (msg.message?.imageMessage?.caption) return msg.message.imageMessage.caption;
            if (msg.message?.videoMessage?.caption) return msg.message.videoMessage.caption;
            return '';
        }
        
        // Start the bot
        await startWhatsAppBot();
        
    } catch (error) {
        console.log('❌ FATAL ERROR:', error);
        console.log('Full error:', error);
        process.exit(1);
    }
}, 1000);

// Handle process events
process.on('uncaughtException', (error) => {
    console.log('🚨 Uncaught Exception:', error.message);
    console.log('Stack:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.log('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});

// Keep alive untuk Railway
setInterval(() => {
    // Do nothing, just keep interval alive
}, 30000);
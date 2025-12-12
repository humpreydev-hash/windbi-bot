// SUPER SIMPLE BOT UNTUK RAILWAY
console.log('🚀 BOT DIMULAI...');

// Fix crypto issue pertama
try {
    global.crypto = require('crypto');
    console.log('✅ Crypto module loaded');
} catch (e) {
    console.log('❌ Crypto error:', e.message);
}

const fs = require('fs');
const path = require('path');

// Buat folder session jika belum ada
if (!fs.existsSync('./auth_info')) {
    fs.mkdirSync('./auth_info', { recursive: true });
    console.log('📁 Folder auth_info dibuat');
}

// Import dengan delay untuk menghindari crash
setTimeout(async () => {
    try {
        console.log('📦 Loading Baileys...');
        const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
        const qrcode = require('qrcode-terminal');
        
        console.log('✅ Modules loaded successfully');
        
        async function startBot() {
            try {
                console.log('🔄 Connecting to WhatsApp...');
                
                const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
                
                const sock = makeWASocket({
                    auth: state,
                    printQRInTerminal: true,
                    browser: ['Railway Bot', 'Chrome', '1.0.0']
                });

                sock.ev.on('connection.update', (update) => {
                    const { connection, lastDisconnect, qr } = update;
                    
                    if (qr) {
                        console.log('\n═══════════════════════════════');
                        console.log('📱 SCAN QR CODE INI DI WHATSAPP:');
                        console.log('═══════════════════════════════');
                        qrcode.generate(qr, { small: true });
                        console.log('═══════════════════════════════\n');
                    }

                    if (connection === 'close') {
                        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                        console.log('⚠️  Koneksi terputus, reconnect:', shouldReconnect);
                        
                        if (shouldReconnect) {
                            setTimeout(() => {
                                console.log('🔄 Reconnecting...');
                                startBot();
                            }, 5000);
                        }
                    } 
                    
                    if (connection === 'open') {
                        console.log('✅ BOT BERHASIL TERHUBUNG KE WHATSAPP!');
                        console.log('🤖 Bot siap menerima pesan...');
                        
                        // Test send message ke diri sendiri
                        const botNumber = sock.user.id.replace(':628', '628') + '@s.whatsapp.net';
                        setTimeout(async () => {
                            try {
                                await sock.sendMessage(botNumber, { 
                                    text: '🤖 *BOT AKTIF*\nBot berhasil jalan di Railway!' 
                                });
                                console.log('📤 Test message sent to self');
                            } catch (e) {
                                console.log('⚠️  Gagal kirim test message:', e.message);
                            }
                        }, 2000);
                    }
                });

                sock.ev.on('creds.update', saveCreds);

                // Simple message handler
                sock.ev.on('messages.upsert', async ({ messages }) => {
                    try {
                        const msg = messages[0];
                        
                        if (!msg.key.fromMe && msg.message) {
                            const text = msg.message.conversation || 
                                       msg.message.extendedTextMessage?.text || 
                                       msg.message.imageMessage?.caption || '';
                            
                            const sender = msg.key.remoteJid;
                            const name = msg.pushName || 'User';
                            
                            console.log(`📩 [${name}]: ${text}`);
                            
                            // Simple commands
                            const cmd = text.toLowerCase().trim();
                            
                            if (cmd === 'ping' || cmd === '!ping' || cmd === '.ping') {
                                await sock.sendMessage(sender, { text: '🏓 Pong!' });
                            }
                            else if (cmd === 'hai' || cmd === 'halo' || cmd === 'hello') {
                                await sock.sendMessage(sender, { text: `Halo juga ${name}! 👋` });
                            }
                            else if (cmd === 'menu' || cmd === '!menu') {
                                const menu = `📱 *MENU BOT*
• ping - Test bot
• hai - Sapaan
• menu - Menu ini
• time - Waktu sekarang
• creator - Pembuat bot`;
                                await sock.sendMessage(sender, { text: menu });
                            }
                            else if (cmd === 'time' || cmd === '!time') {
                                const now = new Date();
                                const waktu = `⏰ *WAKTU SAAT INI*
Tanggal: ${now.toLocaleDateString('id-ID')}
Jam: ${now.toLocaleTimeString('id-ID')}`;
                                await sock.sendMessage(sender, { text: waktu });
                            }
                            else if (cmd === 'creator' || cmd === 'owner') {
                                await sock.sendMessage(sender, { text: '👨‍💻 Creator: Kamu Sendiri!\nDibuat pake Node.js + Baileys' });
                            }
                            else if (text.startsWith('!') || text.startsWith('.')) {
                                await sock.sendMessage(sender, { text: '❓ Command tidak dikenal. Ketik "menu" untuk bantuan.' });
                            }
                        }
                    } catch (e) {
                        console.log('❌ Error handling message:', e.message);
                    }
                });

                // Error handling
                sock.ev.on('connection.update', ({ lastDisconnect }) => {
                    if (lastDisconnect?.error) {
                        console.log('❌ Connection error:', lastDisconnect.error.message);
                    }
                });

            } catch (error) {
                console.log('❌ Bot error:', error.message);
                // Restart setelah 10 detik jika error
                setTimeout(() => {
                    console.log('🔄 Restarting bot...');
                    startBot();
                }, 10000);
            }
        }

        // Start the bot
        await startBot();

    } catch (error) {
        console.log('❌ FATAL ERROR:', error);
        console.log('Stack:', error.stack);
        process.exit(1);
    }
}, 2000); // Delay 2 detik sebelum start

// Keep alive untuk Railway
setInterval(() => {
    console.log('❤️  Bot still alive at:', new Date().toISOString());
}, 30000); // Log setiap 30 detik

// Handle process exit
process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT, shutting down...');
    process.exit(0);
});

console.log('⏳ Bot akan mulai dalam 2 detik...');
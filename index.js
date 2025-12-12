import { makeWASocket, useMultiFileAuthState, DisconnectReason, makeInMemoryStore } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Store untuk menyimpan pesan
const store = makeInMemoryStore({});
store.readFromFile('./baileys_store.json');
setInterval(() => {
    store.writeToFile('./baileys_store.json');
}, 10000);

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        syncFullHistory: false
    });

    store.bind(sock.ev);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('Scan QR Code ini:');
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to:', lastDisconnect.error, ', reconnecting:', shouldReconnect);
            if (shouldReconnect) {
                setTimeout(() => connectToWhatsApp(), 3000);
            }
        } else if (connection === 'open') {
            console.log('✅ Bot connected successfully!');
            console.log('🤖 Bot is ready to receive messages');
            
            // Kirim pesan sambutan ke admin
            const adminNumber = process.env.ADMIN_NUMBER;
            if (adminNumber) {
                setTimeout(() => {
                    sock.sendMessage(adminNumber + '@s.whatsapp.net', { 
                        text: '🤖 *Bot WhatsApp Aktif!*\n\nBot sudah berhasil terhubung dan siap digunakan!' 
                    });
                }, 3000);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const messageText = msg.message.conversation || 
                           msg.message.extendedTextMessage?.text || 
                           msg.message.buttonsResponseMessage?.selectedButtonId || 
                           msg.message.listResponseMessage?.title || 
                           '';

        const command = messageText.toLowerCase().trim();
        const userName = msg.pushName || 'Pengguna';

        console.log(`Pesan dari ${userName}: ${command}`);

        // Handler untuk pesan
        try {
            // Menu utama
            if (command === '!menu' || command === '.menu' || command === 'menu' || command === '/menu') {
                await sendMenu(sock, sender, userName);
            }
            // Tombol button response
            else if (command === '!button' || command === 'button') {
                await sendButtonMenu(sock, sender);
            }
            // List menu response
            else if (command === '!list' || command === 'list') {
                await sendListMenu(sock, sender);
            }
            // Info bot
            else if (command === '!info' || command === '.info' || command === '/info') {
                await sock.sendMessage(sender, { 
                    text: `🤖 *Informasi Bot*\n\n` +
                          `• *Nama:* WhatsApp Bot\n` +
                          `• *Versi:* 1.0.0\n` +
                          `• *Fitur:* Menu Button & List Menu\n` +
                          `• *Status:* Aktif\n\n` +
                          `Ketik *!menu* untuk melihat menu utama`
                });
            }
            // Help
            else if (command === '!help' || command === 'help' || command === '/help') {
                await sock.sendMessage(sender, { 
                    text: `🆘 *Bantuan*\n\n` +
                          `*Perintah yang tersedia:*\n` +
                          `• *menu* - Tampilkan menu utama\n` +
                          `• *button* - Menu dengan tombol\n` +
                          `• *list* - Menu dengan list\n` +
                          `• *info* - Info bot\n` +
                          `• *help* - Bantuan\n\n` +
                          `_Cukup ketik salah satu perintah di atas_`
                });
            }
            // Handler untuk button response
            else if (msg.message?.buttonsResponseMessage) {
                const buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
                await handleButtonResponse(sock, sender, buttonId, userName);
            }
            // Handler untuk list response
            else if (msg.message?.listResponseMessage) {
                const listId = msg.message.listResponseMessage.title;
                await handleListResponse(sock, sender, listId, userName);
            }
            // Balasan default
            else if (command.startsWith('!') || command.startsWith('/') || command.startsWith('.')) {
                await sock.sendMessage(sender, { 
                    text: `Halo ${userName}! 🤖\n` +
                          `Perintah *"${command}"* tidak dikenali.\n\n` +
                          `Ketik *!menu* untuk melihat menu yang tersedia.`
                });
            }
        } catch (error) {
            console.error('Error:', error);
            await sock.sendMessage(sender, { 
                text: '❌ Terjadi kesalahan saat memproses permintaan Anda.'
            });
        }
    });
}

// Fungsi untuk mengirim menu utama
async function sendMenu(sock, sender, userName) {
    await sock.sendMessage(sender, { 
        text: `👋 *Halo ${userName}!*\n\n` +
              `*🤖 BOT WHATSAPP MENU*\n\n` +
              `Silakan pilih jenis menu yang ingin dilihat:\n\n` +
              `📱 *1. Menu Button*\n` +
              `   Ketik: *!button*\n\n` +
              `📋 *2. Menu List*\n` +
              `   Ketik: *!list*\n\n` +
              `ℹ️ *3. Info Bot*\n` +
              `   Ketik: *!info*\n\n` +
              `🆘 *4. Bantuan*\n` +
              `   Ketik: *!help*\n\n` +
              `_Pilih salah satu menu di atas untuk melanjutkan_`
    });
}

// Fungsi untuk mengirim menu dengan button
async function sendButtonMenu(sock, sender) {
    const buttons = [
        {
            buttonId: 'menu_profile',
            buttonText: { displayText: '👤 Profile' },
            type: 1
        },
        {
            buttonId: 'menu_product',
            buttonText: { displayText: '🛍️ Produk' },
            type: 1
        },
        {
            buttonId: 'menu_contact',
            buttonText: { displayText: '📞 Kontak' },
            type: 1
        },
        {
            buttonId: 'menu_back',
            buttonText: { displayText: '🔙 Kembali' },
            type: 1
        }
    ];

    const buttonMessage = {
        text: "📱 *MENU BUTTON*\n\nSilakan pilih salah satu opsi di bawah:",
        footer: "Pilih dengan mengklik tombol",
        buttons: buttons,
        headerType: 1
    };

    await sock.sendMessage(sender, buttonMessage);
}

// Fungsi untuk mengirim menu dengan list
async function sendListMenu(sock, sender) {
    const sections = [
        {
            title: "📋 KATEGORI PRODUK",
            rows: [
                {
                    title: "💻 Elektronik",
                    rowId: "category_electronics",
                    description: "Laptop, HP, Gadget"
                },
                {
                    title: "👕 Fashion",
                    rowId: "category_fashion",
                    description: "Pakaian, Sepatu, Aksesoris"
                },
                {
                    title: "📚 Buku",
                    rowId: "category_books",
                    description: "Novel, Komik, Pendidikan"
                }
            ]
        },
        {
            title: "⚙️ PENGATURAN",
            rows: [
                {
                    title: "🔔 Notifikasi",
                    rowId: "setting_notif",
                    description: "Atur preferensi notifikasi"
                },
                {
                    title: "🌐 Bahasa",
                    rowId: "setting_language",
                    description: "Pilih bahasa yang diinginkan"
                },
                {
                    title: "🔙 Kembali ke Menu",
                    rowId: "menu_main",
                    description: "Kembali ke menu utama"
                }
            ]
        }
    ];

    const listMessage = {
        text: "📋 *MENU LIST*\n\nPilih kategori yang diinginkan:",
        footer: "Scroll untuk melihat lebih banyak",
        title: "Pilihan Menu",
        buttonText: "Buka Menu",
        sections: sections
    };

    await sock.sendMessage(sender, listMessage);
}

// Handler untuk button response
async function handleButtonResponse(sock, sender, buttonId, userName) {
    switch(buttonId) {
        case 'menu_profile':
            await sock.sendMessage(sender, { 
                text: `👤 *PROFILE*\n\n` +
                      `*Nama:* ${userName}\n` +
                      `*Status:* Active User\n` +
                      `*Bergabung:* ${new Date().toLocaleDateString('id-ID')}\n\n` +
                      `Terima kasih telah menggunakan bot kami! 😊`
            });
            break;
            
        case 'menu_product':
            await sock.sendMessage(sender, { 
                text: `🛍️ *PRODUK KAMI*\n\n` +
                      `1. *Paket Basic* - Rp 100.000\n` +
                      `   Fitur dasar bot WhatsApp\n\n` +
                      `2. *Paket Pro* - Rp 250.000\n` +
                      `   Fitur lengkap + database\n\n` +
                      `3. *Paket Enterprise* - Rp 500.000\n` +
                      `   Custom fitur + support 24/7\n\n` +
                      `_Untuk informasi lebih lanjut, hubungi admin_`
            });
            break;
            
        case 'menu_contact':
            await sock.sendMessage(sender, { 
                text: `📞 *KONTAK KAMI*\n\n` +
                      `• *WhatsApp:* +62 812-3456-7890\n` +
                      `• *Email:* support@bot.com\n` +
                      `• *Website:* www.bot.com\n\n` +
                      `⏰ *Jam Operasional:*\n` +
                      `Senin - Jumat: 08:00 - 17:00 WIB\n` +
                      `Sabtu: 08:00 - 12:00 WIB`
            });
            break;
            
        case 'menu_back':
            await sendMenu(sock, sender, userName);
            break;
    }
}

// Handler untuk list response
async function handleListResponse(sock, sender, listId, userName) {
    switch(listId) {
        case 'category_electronics':
            await sock.sendMessage(sender, { 
                text: `💻 *ELEKTRONIK*\n\n` +
                      `• Laptop Gaming - Rp 15.000.000\n` +
                      `• Smartphone Flagship - Rp 12.000.000\n` +
                      `• Tablet Pro - Rp 8.000.000\n` +
                      `• Smart Watch - Rp 3.000.000\n\n` +
                      `_Stok terbatas, hubungi untuk pemesanan_`
            });
            break;
            
        case 'category_fashion':
            await sock.sendMessage(sender, { 
                text: `👕 *FASHION*\n\n` +
                      `• Kaos Premium - Rp 150.000\n` +
                      `• Jeans Denim - Rp 300.000\n` +
                      `• Sepatu Sneakers - Rp 500.000\n` +
                      `• Tas Ransel - Rp 250.000\n\n` +
                      `_Tersedia berbagai ukuran dan warna_`
            });
            break;
            
        case 'category_books':
            await sock.sendMessage(sender, { 
                text: `📚 *BUKU*\n\n` +
                      `• Novel Best Seller - Rp 89.000\n` +
                      `• Buku Programming - Rp 150.000\n` +
                      `• Komik Series - Rp 45.000/vol\n` +
                      `• Buku Anak - Rp 65.000\n\n` +
                      `_Gratis ongkir untuk pembelian >Rp 200.000_`
            });
            break;
            
        case 'setting_notif':
            await sock.sendMessage(sender, { 
                text: `🔔 *PENGATURAN NOTIFIKASI*\n\n` +
                      `Status: ✅ Aktif\n\n` +
                      `Anda akan menerima notifikasi untuk:\n` +
                      `• Pesan baru\n` +
                      `• Update produk\n` +
                      `• Promo spesial\n\n` +
                      `_Pengaturan bisa diubah kapan saja_`
            });
            break;
            
        case 'setting_language':
            await sock.sendMessage(sender, { 
                text: `🌐 *PILIH BAHASA*\n\n` +
                      `Bahasa saat ini: 🇮🇩 Indonesia\n\n` +
                      `Bahasa yang tersedia:\n` +
                      `• Indonesia (Default)\n` +
                      `• English\n` +
                      `• Jawa\n` +
                      `• Sunda\n\n` +
                      `_Fitur multi bahasa dalam pengembangan_`
            });
            break;
            
        case 'menu_main':
            await sendMenu(sock, sender, userName);
            break;
    }
}

// Mulai bot
console.log('🚀 Starting WhatsApp Bot...');
connectToWhatsApp().catch(err => console.error('Failed to start:', err));
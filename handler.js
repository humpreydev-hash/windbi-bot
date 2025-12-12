// Fungsi untuk handle pesan
async function handleMessage(sock, message) {
    try {
        const from = message.key.remoteJid; // Nomor pengirim
        const text = message.message?.conversation || 
                    message.message?.extendedTextMessage?.text || 
                    message.message?.imageMessage?.caption || 
                    '';
        
        const sender = message.pushName || 'User';
        const isGroup = from.endsWith('@g.us');
        
        console.log(`📩 Pesan dari ${sender}: ${text}`);
        
        // Command handler sederhana
        const command = text.toLowerCase().trim();
        
        // Jika pesan kosong (misal cuma gambar)
        if (!text && !message.message?.imageMessage) {
            return;
        }
        
        // COMMAND: !ping
        if (command === '!ping' || command === '.ping') {
            await sock.sendMessage(from, { 
                text: `🏓 Pong! ${sender}\nBot aktif!` 
            });
        }
        
        // COMMAND: !menu
        else if (command === '!menu' || command === '.menu') {
            const menuText = `📱 *MENU BOT*
            
🔹 !ping - Test bot
🔹 !menu - Menu ini
🔹 !info - Info bot
🔹 !sticker - Buat sticker dari gambar
🔹 !quoted <pesan> - Quote pesan
            
_*Kirim gambar dengan caption !sticker untuk membuat sticker*_`;
            
            await sock.sendMessage(from, { text: menuText });
        }
        
        // COMMAND: !info
        else if (command === '!info' || command === '.info') {
            const infoText = `🤖 *BOT INFORMATION*
            
• Name: SimpleBot
• Creator: You
• Language: Node.js
• Library: Baileys
• Status: Active
            
_Semua command diawali ! atau ._`;
            
            await sock.sendMessage(from, { text: infoText });
        }
        
        // COMMAND: !sticker (dari caption gambar)
        else if (command === '!sticker' && message.message?.imageMessage) {
            await sock.sendMessage(from, { 
                text: '⏳ Sedang membuat sticker...' 
            });
            
            // Simpan dulu sebagai sticker command (nanti bisa dikembangkan)
            await sock.sendMessage(from, { 
                text: 'Fitur sticker akan diimplementasi nanti! Kirim !menu untuk menu.' 
            });
        }
        
        // COMMAND: !quoted <pesan>
        else if (command.startsWith('!quoted ') || command.startsWith('.quoted ')) {
            const quotedText = command.split(' ').slice(1).join(' ');
            
            // Reply dengan quote
            await sock.sendMessage(from, { 
                text: `📝 Quoted: ${quotedText}`,
                quoted: message // Ini bikin reply
            });
        }
        
        // BALAS PESAN BIASA
        else if (command === 'hai' || command === 'halo' || command === 'hello') {
            await sock.sendMessage(from, { 
                text: `Halo juga ${sender}! 😊\nKetik !menu untuk melihat menu.` 
            });
        }
        
        // HELP OTOMATIS
        else if (command === 'help' || command === 'bantu') {
            await sock.sendMessage(from, { 
                text: `Butuh bantuan ${sender}? 🤔\nKetik !menu untuk melihat semua command yang tersedia!` 
            });
        }
        
        // RESPON DEFAULT
        else if (text.startsWith('!') || text.startsWith('.')) {
            await sock.sendMessage(from, { 
                text: `❓ Command tidak dikenali: ${text}\nKetik !menu untuk melihat menu.` 
            });
        }
        
    } catch (error) {
        console.error('Error handling message:', error);
    }
}

// Export fungsi
module.exports = { handleMessage };
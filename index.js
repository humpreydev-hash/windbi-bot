// Import library yang dibutuhkan
const { Client, LocalAuth, MessageMedia, List } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const axios = require('axios');
const fs = require('fs');
const mime = require('mime-types');

// Inisialisasi client WhatsApp dengan LocalAuth agar tidak perlu scan QR terus-menerus
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox']
    }
});

// --- KONFIGURASI BOT ---
// Ganti dengan nomor WhatsApp pemilik bot (format: 628xxx@c.us)
const ownerNumber = '6281234567890@c.us'; 
// Prefix untuk perintah bot
const prefix = '#';
// -------------------------

// Event ketika QR code diterima
client.on('qr', qr => {
    console.log('QR Code diterima, silakan scan!');
    // Generate QR code di terminal
    qrcode.generate(qr, { small: true });
});

// Event ketika bot sudah siap
client.on('ready', () => {
    console.log('Bot sudah siap digunakan!');
});

// Event utama untuk menangani pesan masuk
client.on('message', async message => {
    // Abaikan pesan dari bot itu sendiri
    if (message.fromMe) return;

    const chat = await message.getChat();
    const senderNumber = message.author || message.from; // author untuk grup, from untuk pribadi
    const commandBody = message.body.slice(prefix.length).trim();
    const command = commandBody.split(/ +/).shift().toLowerCase();
    const args = commandBody.split(/ +/).slice(1);

    // Hanya proses pesan yang menggunakan prefix
    if (!message.body.startsWith(prefix)) return;

    try {
        // --- ROUTER PERINTAH ---
        switch (command) {
            case 'menu':
            case 'help':
                await sendMenu(message);
                break;

            case 'sticker':
            case 'stiker':
                await createSticker(message, chat);
                break;

            case 'tiktok':
            case 'ig':
            case 'instagram':
            case 'unduh':
            case 'download':
                await downloadMedia(message, args);
                break;

            case 'wiki':
            case 'wikipedia':
                await searchWikipedia(message, args);
                break;

            case 'quote':
            case 'quotes':
                await getRandomQuote(message);
                break;

            case 'qrcode':
                await generateQRCode(message, args);
                break;

            case 'tagall':
                await tagAllMembers(message, chat, senderNumber);
                break;

            case 'kick':
                await kickMember(message, chat, senderNumber);
                break;
            
            case 'infogrup':
            case 'groupinfo':
                await getGroupInfo(chat, message);
                break;

            case 'ping':
                await pingBot(message);
                break;

            case 'owner':
                await message.reply(`Pemilik bot ini adalah: @${ownerNumber.split('@')[0]}`, null, { mentions: [ownerNumber] });
                break;

            default:
                await message.reply(`Perintah tidak dikenali. Ketik *${prefix}menu* untuk melihat daftar fitur.`);
                break;
        }
    } catch (error) {
        console.error('Terjadi kesalahan:', error);
        await message.reply('Maaf, terjadi kesalahan saat memproses perintah kamu.');
    }
});

// --- FUNGSI-FUNGSI FITUR ---

// Fungsi untuk mengirim menu list button
async function sendMenu(message) {
    const sections = [
        {
            title: '🛠️ Alat & Utilitas',
            rows: [
                { title: '🖼️ Buat Stiker', id: `${prefix}stiker` },
                { title: '📥 Unduh Media (TT/IG)', id: `${prefix}unduh` },
                { title: '🔍 Cari di Wikipedia', id: `${prefix}wiki` },
                { title: '📜 Kutipan Random', id: `${prefix}quote` },
                { title: '⚫ Buat QR Code', id: `${prefix}qrcode` },
            ]
        },
        {
            title: '👥 Fitur Grup',
            rows: [
                { title: '📢 Tag Semua Anggota', id: `${prefix}tagall` },
                { title: '👋 Kick Anggota', id: `${prefix}kick` },
                { title: 'ℹ️ Info Grup', id: `${prefix}infogrup` },
            ]
        },
        {
            title: '🤖 Lainnya',
            rows: [
                { title: '🏓 Ping Bot', id: `${prefix}ping` },
                { title: '👤 Info Pemilik', id: `${prefix}owner` },
            ]
        }
    ];

    const list = new List(
        'Halo! 👋 Silakan pilih fitur yang ingin kamu gunakan dari menu di bawah ini.',
        '📋 Menu Bot',
        sections,
        'Pilih Fitur'
    );

    await message.reply(list);
}

// Fungsi untuk membuat stiker
async function createSticker(message, chat) {
    if (message.hasMedia && (message.type === 'image' || message.type === 'video')) {
        await message.reply('⏳ Sedang membuat stiker, tunggu sebentar...');
        const media = await message.downloadMedia();
        client.sendMessage(message.from, media, { sendMediaAsSticker: true, stickerAuthor: 'Bot WA', stickerName: 'Stiker' });
    } else {
        await message.reply('❌ Mohon kirim atau balas gambar/video dengan caption *#sticker*');
    }
}

// Fungsi untuk mengunduh media
async function downloadMedia(message, args) {
    if (args.length === 0) {
        return message.reply('❌ Mohon berikan link media yang ingin diunduh.\nContoh: *#unduh https://vt.tiktok.com/...*');
    }
    const url = args[0];
    await message.reply('⏳ Sedang memproses link, mohon tunggu...');
    
    try {
        // Menggunakan API publik untuk downloader
        const { data } = await axios.get(`https://api.ryzendesu.vip/api/downloader/yt?url=${url}`);
        if (data.status && data.media) {
            const mediaUrl = data.media.url;
            const media = await MessageMedia.fromUrl(mediaUrl);
            await client.sendMessage(message.from, media, { caption: '✅ Berhasil mengunduh media!' });
        } else {
            await message.reply('❌ Gagal mengunduh. Pastikan link valid dan didukung (TikTok, YouTube, Instagram, dll).');
        }
    } catch (error) {
        console.error(error);
        await message.reply('❌ Terjadi kesalahan saat mengunduh media.');
    }
}

// Fungsi untuk pencarian Wikipedia
async function searchWikipedia(message, args) {
    if (args.length === 0) {
        return message.reply('❌ Mohon berikan kata kunci untuk pencarian.\nContoh: *#wiki Indonesia*');
    }
    const query = args.join(' ');
    await message.reply(`⏳ Sedang mencari "${query}" di Wikipedia...`);

    try {
        const { data } = await axios.get(`https://id.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
        if (data.extract) {
            const response = `📖 *Wikipedia*\n\n📌 *Judul:* ${data.title}\n\n📝 *Deskripsi:*\n${data.extract}\n\n🔗 *Baca selengkapnya:* ${data.content_urls.desktop.page}`;
            await message.reply(response);
        } else {
            await message.reply('❌ Tidak ditemukan hasil untuk pencarian tersebut.');
        }
    } catch (error) {
        await message.reply('❌ Terjadi kesalahan atau tidak ditemukan hasil.');
    }
}

// Fungsi untuk mendapatkan kutipan random
async function getRandomQuote(message) {
    try {
        const { data } = await axios.get('https://api.quotable.io/random');
        const response = `💬 *Kutipan Hari Ini*\n\n"${data.content}"\n\n- _${data.author}_`;
        await message.reply(response);
    } catch (error) {
        await message.reply('❌ Gagal mendapatkan kutipan, coba lagi nanti.');
    }
}

// Fungsi untuk generate QR Code
async function generateQRCode(message, args) {
    if (args.length === 0) {
        return message.reply('❌ Mohon berikan teks untuk dijadikan QR Code.\nContoh: *#qrcode Halo Dunia*');
    }
    const text = args.join(' ');
    try {
        const qrCodeDataUrl = await qrcode.toDataURL(text);
        // Simpan sementara untuk dikirim
        const base64Data = qrCodeDataUrl.replace(/^data:image\/png;base64,/, '');
        fs.writeFileSync('qrcode.png', base64Data, 'base64');
        
        const media = MessageMedia.fromFilePath('qrcode.png');
        await message.reply(media, message.from, { caption: `✅ QR Code untuk teks: "${text}"` });
        
        // Hapus file setelah dikirim
        fs.unlinkSync('qrcode.png');
    } catch (error) {
        await message.reply('❌ Gagal membuat QR Code.');
    }
}

// Fungsi untuk menandai semua anggota grup
async function tagAllMembers(message, chat, senderNumber) {
    if (!chat.isGroup) return message.reply('❌ Perintah ini hanya bisa digunakan di dalam grup.');
    
    const participants = chat.participants;
    const isAdmin = participants.find(p => p.id._serialized === senderNumber)?.isAdmin;
    
    if (!isAdmin) return message.reply('❌ Maaf, hanya admin grup yang bisa menggunakan perintah ini.');
    
    let text = '📢 *Pemberitahuan untuk Semua Anggota*\n\n';
    participants.forEach((participant, index) => {
        text += `@${participant.id.user} `;
    });
    
    await message.reply(text, null, { mentions: participants.map(p => p.id._serialized) });
}

// Fungsi untuk mengeluarkan anggota
async function kickMember(message, chat, senderNumber) {
    if (!chat.isGroup) return message.reply('❌ Perintah ini hanya bisa digunakan di dalam grup.');
    
    const mentionedIds = message.mentionedIds;
    if (mentionedIds.length === 0) {
        return message.reply('❌ Mohon tag atau sebutkan anggota yang ingin dikeluarkan.\nContoh: *#kick @user*');
    }
    
    const isAdmin = chat.participants.find(p => p.id._serialized === senderNumber)?.isAdmin;
    if (!isAdmin) return message.reply('❌ Maaf, hanya admin grup yang bisa menggunakan perintah ini.');

    try {
        await chat.removeParticipants(mentionedIds);
        await message.reply('✅ Anggota berhasil dikeluarkan.');
    } catch (error) {
        await message.reply('❌ Gagal mengeluarkan anggota. Pastikan bot adalah admin.');
    }
}

// Fungsi untuk mendapatkan info grup
async function getGroupInfo(chat, message) {
    if (!chat.isGroup) return message.reply('❌ Perintah ini hanya bisa digunakan di dalam grup.');
    
    const info = `ℹ️ *Info Grup*\n\n📌 *Nama Grup:* ${chat.name}\n👥 *Jumlah Anggota:* ${chat.participants.length}\n📝 *Deskripsi:* ${chat.description || 'Tidak ada deskripsi.'}\n🔗 *Dibuat pada:* ${chat.createdAt.toString()}\n👑 *Dibuat oleh:* @${chat.owner.user}`;
    
    await message.reply(info, null, { mentions: [chat.owner._serialized] });
}

// Fungsi untuk mengecek ping
async function pingBot(message) {
    const timestamp = message.timestamp;
    const latency = Date.now() - (timestamp * 1000);
    await message.reply(`🏓 Pong!\n⚡ Kecepatan respon: ${latency} ms`);
}


// Inisialisasi client
client.initialize();
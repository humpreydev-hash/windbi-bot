import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, downloadContentFromMessage } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import ytdl from 'ytdl-core';
import fs from 'fs/promises';
import os from 'os';
import osUtils from 'os-utils';
import sqlite3 from 'sqlite3';
import { readFile, writeFile, unlink } from 'fs/promises';

// --- PENYESUAIAN UNTUK ESM ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// -----------------------------

// --- KONFIGURASI BOT ---
const ownerNumber = '6285929088764@s.whatsapp.net'; // Ganti dengan nomor WA kamu
const botPrefix = '.';
let selfMode = false; // State untuk mode self

// Path untuk Railway (sesuaikan)
const sessionId = process.env.RAILWAY_SERVICE_NAME || 'session';
const dbPath = path.join('/tmp', 'verified_users.db'); // Database di /tmp agar tidak hilang
const authPath = path.join(__dirname, 'auth_info_' + sessionId); // Sesi unik per service
// -------------------------

// --- FUNGSI DATABASE ---
const db = new sqlite3.Database(dbPath);

// Inisialisasi database
db.serialize(() => {
    db.run('CREATE TABLE IF NOT EXISTS verified_users (jid TEXT PRIMARY KEY)');
    db.run('CREATE TABLE IF NOT EXISTS game_scores (jid TEXT, game TEXT, score INTEGER)');
});

function isUserVerified(jid) {
    return new Promise((resolve, reject) => {
        db.get('SELECT jid FROM verified_users WHERE jid = ?', [jid], (err, row) => {
            if (err) reject(err);
            else resolve(!!row);
        });
    });
}

function addUserToDatabase(jid) {
    return new Promise((resolve, reject) => {
        db.run('INSERT OR IGNORE INTO verified_users (jid) VALUES (?)', [jid], function(err) {
            if (err) reject(err);
            else resolve();
        });
    });
}
// -------------------------

// --- DATA GAME ---
const tebakkataData = [
    { soal: "Aku punya daun tapi bukan pohon, aku punya duri tapi bukan mawar. Siapa aku?", jawab: "nanas" },
    { soal: "Berjalan tanpa kaki, bernyanyi tanpa mulut, tak pernah tidur tapi selalu diam. Siapa aku?", jawab: "sungai" },
    { soal: "Semakin dikeringkan, semakin basah. Apa itu?", jawab: "handuk" },
    { soal: "Benda apa yang selalu naik tapi tidak pernah turun?", jawab: "umur" },
    { soal: "Bisa menembus kaca tanpa merusaknya. Apa itu?", jawab: "cahaya" }
];

let activeGames = {};
// -------------------------

// --- FUNGSI HELPER ---
function extractMessageText(msg) {
    const msgType = Object.keys(msg.message)[0];
    if (msgType === 'conversation') return msg.message.conversation;
    if (msgType === 'extendedTextMessage') return msg.message.extendedTextMessage.text;
    if (msgType === 'imageMessage') return msg.message.imageMessage?.caption || '';
    if (msgType === 'videoMessage') return msg.message.videoMessage?.caption || '';
    return '';
}

function parseMention(text) {
    const matches = text.match(/@(\d+)/g);
    if (!matches) return [];
    return matches.map(m => m.replace('@', '') + '@s.whatsapp.net');
}

function isOwner(jid) {
    return jid === ownerNumber || jid.replace(/@s\.whatsapp\.net$/, '') === ownerNumber.replace(/@s\.whatsapp\.net$/, '');
}

async function getGroupAdmins(groupJid, sock) {
    try {
        const metadata = await sock.groupMetadata(groupJid);
        return metadata.participants.filter(p => p.admin).map(p => p.id);
    } catch (error) {
        console.error('Error getting group admins:', error);
        return [];
    }
}

async function isGroupAdmin(groupJid, userJid, sock) {
    const admins = await getGroupAdmins(groupJid, sock);
    return admins.includes(userJid);
}
// -------------------------

// --- FUNGSI-FUNGSI FITUR ---

// 1. Menu
async function showMenu(sock, message) {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    const statusUptime = `${hours} Jam ${minutes} Menit ${seconds} Detik`;

    const cpuUsage = await new Promise(resolve => osUtils.cpuUsage(resolve));
    const freeMem = osUtils.freemem();
    const totalMem = osUtils.totalmem();
    const usedMem = totalMem - freeMem;
    const ramUsage = ((usedMem / totalMem) * 100).toFixed(2);
    
    const githubLink = `https://github.com/humpreydev-hash/`;

    const menuText = `
╭╼━━━━━━━━━━━━━━━━━━━━╾❐
│ 𝗪𝗜𝗡𝗗𝗕𝗜 𝗕𝗢𝗧 𝗪𝗛𝗔𝗧𝗦𝗔𝗣𝗣
├╼━━━━━━━━━━━━━━━━━━━━╾╮
│ 𝗨𝗣𝗧𝗜𝗠𝗘 𝗦𝗬𝗦𝗧𝗘𝗠
│ • CPU   : ${cpuUsage.toFixed(2)}%
│ • RAM   : ${ramUsage}% (${(usedMem / 1024).toFixed(2)}MB / ${(totalMem / 1024).toFixed(2)}MB)
│ • DISK  : Tidak tersedia
│
│ 𝗦𝗧𝗔𝗧𝗨𝗦 : ${statusUptime}
├╼━━━━━━━━━━━━━━━━━━━━╾〢
│ Bot ini dibuat oleh aal
│ [humpreyDev]. Bot simple
│ menggunakan Node.js. Ini
│ adalah project kedua setelah
│ WindbiOm AI.
╰╼━━━━━━━━━━━━━━━━━━━━╾❏
github: ${githubLink}

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗣𝗨𝗕𝗟𝗜𝗞 ⧽━╾❐
│ • .verify
│ • .link
│ • .gig
│ • .github
│ • .help
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗚𝗔𝗠𝗘𝗦 ⧽━╾❐
│ • .tebakkata
│ • .mathquiz
│ • .tebakangka
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗙𝗨𝗡 ⧽━╾❐
│ • .cekiman <@tag>
│ • .cekfemboy <@tag>
│ • .cekfurry <@tag>
│ • .cekjamet <@..>
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗥 ⧽━╾❐
│ • .playyt <query>
│ • .yt <url>
│ • .ig <url>
│ • .stiker <reply> <watermark>
│ • .tostiker <reply img/vid>
│ • .tomedia <reply stiker>
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗔𝗗𝗠𝗜𝗡 ⧽━╾❐
│ • .kick <@tag>
│ • .ban <@tag>
│ • .grup buka|tutup
│ • .totag <pesan>
│ • .self
│ • .unself
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗢𝗪𝗡𝗘𝗥 ⧽━╾❐
│ • .npm <library>
│ • .gclone <github link>
│ • .apistatus
│ • .log
╰╼━━━━━━━━━━━━━━━━╾❏
> copyright aal dev
> humpreyDEV
    `;
    await sock.sendMessage(message.key.remoteJid, { text: menuText });
}

// 2. Verify
async function verifyCommand(sock, message) {
    const senderJid = message.key.remoteJid;
    if (await isUserVerified(senderJid)) {
        return sock.sendMessage(senderJid, { text: '✅ Nomor kamu sudah terverifikasi.' });
    }
    await addUserToDatabase(senderJid);
    return sock.sendMessage(senderJid, { text: '✅ Verifikasi berhasil! Selamat menggunakan bot.' });
}

// 3. Self / Unself (OWNER ONLY)
async function selfCommand(sock, message) {
    const senderJid = message.key.participant || message.key.remoteJid;
    if (!isOwner(senderJid)) {
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Command ini hanya untuk owner!' });
    }
    selfMode = true;
    return sock.sendMessage(message.key.remoteJid, { text: '✅ Mode self diaktifkan. Hanya owner yang bisa menggunakan bot.' });
}

async function unselfCommand(sock, message) {
    const senderJid = message.key.participant || message.key.remoteJid;
    if (!isOwner(senderJid)) {
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Command ini hanya untuk owner!' });
    }
    selfMode = false;
    return sock.sendMessage(message.key.remoteJid, { text: '✅ Mode self dinonaktifkan.' });
}

// 4. TikTok Downloader
async function tosCommand(sock, message, text) {
    const url = text.split(' ')[1];
    if (!url) return sock.sendMessage(message.key.remoteJid, { text: 'Kirim link TikToknya!\nContoh: .tiktok https://vt.tiktok.com/xxx' });
    
    try {
        await sock.sendMessage(message.key.remoteJid, { text: '⏳ Sedang mendownload...' });
        
        // Menggunakan API external untuk download TikTok
        const response = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`);
        const data = response.data;
        
        if (data.video && data.video.noWatermark) {
            await sock.sendMessage(message.key.remoteJid, { 
                video: { url: data.video.noWatermark }, 
                caption: `*TikTok Downloader*\n\n🎵 *Judul:* ${data.title || 'Tanpa judul'}\n👤 *Author:* ${data.author.nickname || 'Unknown'}` 
            });
        } else if (data.images) {
            for (const img of data.images) {
                await sock.sendMessage(message.key.remoteJid, { image: { url: img } });
            }
            await sock.sendMessage(message.key.remoteJid, { 
                text: `*TikTok Downloader*\n\n👤 *Author:* ${data.author.nickname || 'Unknown'}` 
            });
        }
    } catch (error) {
        console.error('TikTok download error:', error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mendownload. Pastikan link benar.' });
    }
}

// 5. Instagram Downloader (FIXED)
async function igCommand(sock, message, text) {
    const url = text.split(' ')[1];
    if (!url) return sock.sendMessage(message.key.remoteJid, { text: 'Kirim link Instagramnya!\nContoh: .ig https://instagram.com/p/xxx' });
    
    try {
        await sock.sendMessage(message.key.remoteJid, { text: '⏳ Sedang mendownload dari Instagram...' });
        
        // Menggunakan API external
        const response = await axios.get(`https://api.igdownloader.app/api/igdl?url=${encodeURIComponent(url)}`);
        const data = response.data;
        
        if (data.media) {
            for (const media of data.media) {
                if (media.type === 'image') {
                    await sock.sendMessage(message.key.remoteJid, { image: { url: media.url } });
                } else if (media.type === 'video') {
                    await sock.sendMessage(message.key.remoteJid, { video: { url: media.url } });
                }
            }
            await sock.sendMessage(message.key.remoteJid, { 
                text: `*Instagram Downloader*\n\n👤 *Author:* ${data.username || 'Unknown'}` 
            });
        } else {
            throw new Error('Tidak ada media ditemukan');
        }
    } catch (error) {
        console.error('Instagram download error:', error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mendownload. Pastikan link benar.' });
    }
}

// 6. YouTube Downloader (Audio)
async function playytCommand(sock, message, text) {
    const query = text.slice(8).trim();
    if (!query) return sock.sendMessage(message.key.remoteJid, { text: 'Masukkan judul lagu!\nContoh: .playyt Coldplay Adventure of a Lifetime' });
    
    try {
        await sock.sendMessage(message.key.remoteJid, { text: '⏳ Mencari lagu...' });
        
        // Search video
        const searchResults = await ytdl.getInfo(`https://www.youtube.com/watch?v=${(await ytdl.search(query, { limit: 1 }))[0]?.videoId}`);
        
        if (!searchResults) {
            return sock.sendMessage(message.key.remoteJid, { text: '❌ Lagu tidak ditemukan' });
        }
        
        await sock.sendMessage(message.key.remoteJid, { text: '⏳ Sedang mengunduh audio...' });
        
        // Download audio
        const stream = ytdl(searchResults.videoDetails.video_url, { 
            filter: 'audioonly',
            quality: 'highestaudio'
        });
        
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        
        // Send audio
        await sock.sendMessage(message.key.remoteJid, { 
            audio: buffer, 
            mimetype: 'audio/mpeg',
            ptt: false
        });
        
    } catch (error) {
        console.error('YouTube audio download error:', error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mengunduh lagu.' });
    }
}

// 7. YouTube Downloader (Video)
async function ytCommand(sock, message, text) {
    const url = text.split(' ')[1];
    if (!url) return sock.sendMessage(message.key.remoteJid, { text: 'Kirim link YouTube!\nContoh: .yt https://youtube.com/watch?v=xxx' });
    
    try {
        await sock.sendMessage(message.key.remoteJid, { text: '⏳ Sedang mengunduh video...' });
        
        // Get video info
        const info = await ytdl.getInfo(url);
        const format = ytdl.chooseFormat(info.formats, { quality: 'lowest' });
        
        // Download video
        const stream = ytdl(url, { quality: 'lowest' });
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        
        // Send video
        await sock.sendMessage(message.key.remoteJid, { 
            video: buffer,
            caption: `*YouTube Downloader*\n\n📹 *Judul:* ${info.videoDetails.title}\n⏱️ *Durasi:* ${info.videoDetails.lengthSeconds} detik`
        });
        
    } catch (error) {
        console.error('YouTube video download error:', error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mengunduh video.' });
    }
}

// 8. Sticker dengan watermark
async function stikerCommand(sock, message, text) {
    const msgType = Object.keys(message.message)[0];
    const isQuoted = message.message.extendedTextMessage?.contextInfo?.quotedMessage;
    
    if (!['imageMessage', 'videoMessage'].includes(msgType) && !isQuoted) {
        return sock.sendMessage(message.key.remoteJid, { text: 'Reply gambar/video dengan caption .stiker <watermark>\nContoh: .stiker by WindbiBot' });
    }
    
    try {
        const watermark = text.split(' ').slice(1).join(' ') || 'by WindbiBot';
        
        let buffer;
        if (isQuoted) {
            const quotedMsg = message.message.extendedTextMessage.contextInfo.quotedMessage;
            const quotedType = Object.keys(quotedMsg)[0];
            
            if (!['imageMessage', 'videoMessage'].includes(quotedType)) {
                return sock.sendMessage(message.key.remoteJid, { text: 'Hanya bisa reply gambar/video!' });
            }
            
            const stream = await downloadContentFromMessage(quotedMsg[quotedType], quotedType.replace('Message', ''));
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            buffer = Buffer.concat(chunks);
        } else {
            const stream = await downloadContentFromMessage(message.message[msgType], msgType.replace('Message', ''));
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            buffer = Buffer.concat(chunks);
        }
        
        // Kirim sticker
        await sock.sendMessage(message.key.remoteJid, { 
            sticker: buffer,
            contextInfo: {
                mentionedJid: [],
                forwardingScore: 999,
                isForwarded: false
            }
        }, { quoted: message });
        
    } catch (error) {
        console.error("Gagal membuat stiker:", error);
        return sock.sendMessage(message.key.remoteJid, { text: 'Gagal membuat stiker.' });
    }
}

// 9. To Sticker (Image/Video to Sticker)
async function tostikerCommand(sock, message) {
    const msgType = Object.keys(message.message)[0];
    
    if (!['imageMessage', 'videoMessage'].includes(msgType)) {
        return sock.sendMessage(message.key.remoteJid, { text: 'Reply gambar/video dengan caption .tostiker' });
    }
    
    try {
        const stream = await downloadContentFromMessage(message.message[msgType], msgType.replace('Message', ''));
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        
        await sock.sendMessage(message.key.remoteJid, { 
            sticker: buffer 
        }, { quoted: message });
        
    } catch (error) {
        console.error("Gagal membuat stiker:", error);
        return sock.sendMessage(message.key.remoteJid, { text: 'Gagal membuat stiker.' });
    }
}

// 10. To Media (Sticker to Image)
async function tomediaCommand(sock, message) {
    const msgType = Object.keys(message.message)[0];
    
    if (msgType !== 'stickerMessage') {
        return sock.sendMessage(message.key.remoteJid, { text: 'Reply stiker dengan caption .tomedia' });
    }
    
    try {
        const stream = await downloadContentFromMessage(message.message.stickerMessage, 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        
        // Check if sticker is animated
        const isAnimated = message.message.stickerMessage.isAnimated;
        
        if (isAnimated) {
            // Convert to video
            await sock.sendMessage(message.key.remoteJid, { 
                video: buffer 
            }, { quoted: message });
        } else {
            // Convert to image
            await sock.sendMessage(message.key.remoteJid, { 
                image: buffer 
            }, { quoted: message });
        }
        
    } catch (error) {
        console.error("Gagal mengkonversi stiker:", error);
        return sock.sendMessage(message.key.remoteJid, { text: 'Gagal mengkonversi stiker ke media.' });
    }
}

// 11. Group Open/Close (ADMIN ONLY)
async function grupCommand(sock, message, text) {
    const senderJid = message.key.participant || message.key.remoteJid;
    const groupJid = message.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us')) {
        return sock.sendMessage(senderJid, { text: '❌ Command ini hanya untuk grup!' });
    }
    
    // Cek apakah pengirim adalah admin
    const isAdmin = await isGroupAdmin(groupJid, senderJid, sock);
    if (!isAdmin && !isOwner(senderJid)) {
        return sock.sendMessage(senderJid, { text: '❌ Command ini hanya untuk admin grup!' });
    }
    
    const action = text.split(' ')[1]?.toLowerCase();
    if (action === 'buka') {
        await sock.groupSettingUpdate(groupJid, 'not_announcement');
        await sock.sendMessage(groupJid, { text: '✅ Grup telah dibuka untuk semua member.' });
    } else if (action === 'tutup') {
        await sock.groupSettingUpdate(groupJid, 'announcement');
        await sock.sendMessage(groupJid, { text: '✅ Grup telah ditutup, hanya admin yang bisa mengirim pesan.' });
    } else {
        await sock.sendMessage(senderJid, { text: '❌ Gunakan: .grup buka atau .grup tutup' });
    }
}

// 12. Tag All (ADMIN ONLY)
async function totagCommand(sock, message, text) {
    const senderJid = message.key.participant || message.key.remoteJid;
    const groupJid = message.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us')) {
        return sock.sendMessage(senderJid, { text: '❌ Command ini hanya untuk grup!' });
    }
    
    // Cek apakah pengirim adalah admin
    const isAdmin = await isGroupAdmin(groupJid, senderJid, sock);
    if (!isAdmin && !isOwner(senderJid)) {
        return sock.sendMessage(senderJid, { text: '❌ Command ini hanya untuk admin grup!' });
    }
    
    try {
        const metadata = await sock.groupMetadata(groupJid);
        const participants = metadata.participants;
        const mentions = participants.map(p => p.id);
        const msgToTag = text.slice(7).trim() || 'Halo semua!';
        
        await sock.sendMessage(groupJid, { 
            text: `📢 *PEMBERITAHUAN*\n\n${msgToTag}\n\n_Mention all by ${metadata.subject || 'Group'}_`, 
            mentions 
        });
        
    } catch (error) {
        console.error('Tag all error:', error);
        return sock.sendMessage(senderJid, { text: '❌ Gagal melakukan tag all.' });
    }
}

// 13. Kick Member (ADMIN ONLY)
async function kickCommand(sock, message, text) {
    const senderJid = message.key.participant || message.key.remoteJid;
    const groupJid = message.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us')) {
        return sock.sendMessage(senderJid, { text: '❌ Command ini hanya untuk grup!' });
    }
    
    // Cek apakah pengirim adalah admin
    const isAdmin = await isGroupAdmin(groupJid, senderJid, sock);
    if (!isAdmin && !isOwner(senderJid)) {
        return sock.sendMessage(senderJid, { text: '❌ Command ini hanya untuk admin grup!' });
    }
    
    const mentions = parseMention(text);
    if (mentions.length === 0) {
        return sock.sendMessage(senderJid, { text: '❌ Tag member yang ingin di-kick!\nContoh: .kick @member' });
    }
    
    try {
        for (const userJid of mentions) {
            await sock.groupParticipantsUpdate(groupJid, [userJid], 'remove');
            await new Promise(resolve => setTimeout(resolve, 1000)); // Delay antar kick
        }
        await sock.sendMessage(groupJid, { text: `✅ Berhasil mengeluarkan ${mentions.length} member.` });
    } catch (error) {
        console.error('Kick error:', error);
        return sock.sendMessage(senderJid, { text: '❌ Gagal mengeluarkan member.' });
    }
}

// 14. Ban Member (ADMIN ONLY)
async function banCommand(sock, message, text) {
    const senderJid = message.key.participant || message.key.remoteJid;
    const groupJid = message.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us')) {
        return sock.sendMessage(senderJid, { text: '❌ Command ini hanya untuk grup!' });
    }
    
    // Cek apakah pengirim adalah admin
    const isAdmin = await isGroupAdmin(groupJid, senderJid, sock);
    if (!isAdmin && !isOwner(senderJid)) {
        return sock.sendMessage(senderJid, { text: '❌ Command ini hanya untuk admin grup!' });
    }
    
    const mentions = parseMention(text);
    if (mentions.length === 0) {
        return sock.sendMessage(senderJid, { text: '❌ Tag member yang ingin di-ban!\nContoh: .ban @member' });
    }
    
    try {
        // Ban = kick + prevent join
        for (const userJid of mentions) {
            await sock.groupParticipantsUpdate(groupJid, [userJid], 'remove');
            // Bisa ditambahkan log ke database untuk banned users
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        await sock.sendMessage(groupJid, { text: `✅ Berhasil mem-ban ${mentions.length} member.` });
    } catch (error) {
        console.error('Ban error:', error);
        return sock.sendMessage(senderJid, { text: '❌ Gagal mem-ban member.' });
    }
}

// 15. GitHub Info
async function githubCommand(sock, message, text) {
    const username = text.split(' ')[1];
    if (!username) return sock.sendMessage(message.key.remoteJid, { text: 'Masukkan username GitHub.\nContoh: .github humpreydev-hash' });
    
    try {
        const { data } = await axios.get(`https://api.github.com/users/${username}`);
        const resultText = `*GitHub Profile*\n\n👤 *Username:* ${data.login}\n📝 *Name:* ${data.name || 'No name'}\n📊 *Public Repos:* ${data.public_repos}\n👥 *Followers:* ${data.followers}\n🔗 *Profile:* ${data.html_url}`;
        await sock.sendMessage(message.key.remoteJid, { text: resultText });
    } catch (error) {
        await sock.sendMessage(message.key.remoteJid, { text: '❌ User tidak ditemukan.' });
    }
}

// 16. NPM Info (OWNER ONLY)
async function npmCommand(sock, message, text) {
    const senderJid = message.key.participant || message.key.remoteJid;
    if (!isOwner(senderJid)) {
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Command ini hanya untuk owner!' });
    }
    
    const packageName = text.split(' ')[1];
    if (!packageName) return sock.sendMessage(message.key.remoteJid, { text: 'Masukkan nama package.\nContoh: .npm axios' });
    
    try {
        const { data } = await axios.get(`https://registry.npmjs.org/${packageName}`);
        const latestVersion = data['dist-tags'].latest;
        const description = data.versions[latestVersion].description || 'Tidak ada deskripsi.';
        const resultText = `*NPM Package Info*\n\n📦 *Name:* ${packageName}\n🔖 *Version:* ${latestVersion}\n📄 *Description:* ${description}`;
        await sock.sendMessage(message.key.remoteJid, { text: resultText });
    } catch (error) {
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Package tidak ditemukan.' });
    }
}

// 17. GitHub Clone (OWNER ONLY)
async function gcloneCommand(sock, message, text) {
    const senderJid = message.key.participant || message.key.remoteJid;
    if (!isOwner(senderJid)) {
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Command ini hanya untuk owner!' });
    }
    
    const url = text.split(' ')[1];
    if (!url) return sock.sendMessage(message.key.remoteJid, { text: 'Masukkan link GitHub.\nContoh: .gclone https://github.com/user/repo' });
    
    try {
        // Extract repo info from URL
        const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (!match) {
            return sock.sendMessage(message.key.remoteJid, { text: '❌ Format URL tidak valid.' });
        }
        
        const [, user, repo] = match;
        const repoUrl = `https://github.com/${user}/${repo}`;
        const apiUrl = `https://api.github.com/repos/${user}/${repo}`;
        
        const { data } = await axios.get(apiUrl);
        const resultText = `*GitHub Repository Info*\n\n📂 *Repo:* ${data.full_name}\n📝 *Description:* ${data.description || 'No description'}\n⭐ *Stars:* ${data.stargazers_count}\n🍴 *Forks:* ${data.forks_count}\n🔗 *URL:* ${repoUrl}\n📥 *Clone:* \`git clone ${repoUrl}.git\``;
        
        await sock.sendMessage(message.key.remoteJid, { text: resultText });
    } catch (error) {
        console.error('GitHub clone error:', error);
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mendapatkan info repository.' });
    }
}

// 18. API Status (OWNER ONLY)
async function apistatusCommand(sock, message) {
    const senderJid = message.key.participant || message.key.remoteJid;
    if (!isOwner(senderJid)) {
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Command ini hanya untuk owner!' });
    }
    
    try {
        const apis = [
            { name: 'GitHub API', url: 'https://api.github.com' },
            { name: 'NPM Registry', url: 'https://registry.npmjs.org' },
            { name: 'YouTube', url: 'https://www.youtube.com' },
            { name: 'Instagram', url: 'https://www.instagram.com' }
        ];
        
        let statusText = '*API Status Check*\n\n';
        
        for (const api of apis) {
            try {
                const start = Date.now();
                await axios.get(api.url, { timeout: 5000 });
                const latency = Date.now() - start;
                statusText += `✅ ${api.name}: Online (${latency}ms)\n`;
            } catch (error) {
                statusText += `❌ ${api.name}: Offline\n`;
            }
        }
        
        await sock.sendMessage(message.key.remoteJid, { text: statusText });
    } catch (error) {
        console.error('API status error:', error);
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mengecek status API.' });
    }
}

// 19. Log (OWNER ONLY)
async function logCommand(sock, message) {
    const senderJid = message.key.participant || message.key.remoteJid;
    if (!isOwner(senderJid)) {
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Command ini hanya untuk owner!' });
    }
    
    try {
        const logInfo = `
*System Log Information*
        
🖥️ *Platform:* ${process.platform}
📦 *Node.js:* ${process.version}
🗺️ *Architecture:* ${process.arch}
⏱️ *Uptime:* ${Math.floor(process.uptime())} detik
💾 *Memory Usage:* ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB
📂 *Working Directory:* ${process.cwd()}
        
*Bot Status:*
✅ Connected
🔧 Self Mode: ${selfMode ? 'ON' : 'OFF'}
📊 Verified Users: ${await getVerifiedCount()} users
        `;
        
        await sock.sendMessage(message.key.remoteJid, { text: logInfo });
    } catch (error) {
        console.error('Log error:', error);
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mengambil log.' });
    }
}

// Helper: Get verified users count
function getVerifiedCount() {
    return new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM verified_users', (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
        });
    });
}

// 20. Get Group Info (gig)
async function gigCommand(sock, message) {
    const groupJid = message.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us')) {
        return sock.sendMessage(groupJid, { text: '❌ Command ini hanya untuk grup!' });
    }
    
    try {
        const metadata = await sock.groupMetadata(groupJid);
        const participants = metadata.participants;
        const admins = participants.filter(p => p.admin).map(p => p.id.split('@')[0]);
        
        const groupInfo = `
*Group Information*
        
📛 *Nama Grup:* ${metadata.subject}
👑 *Pembuat:* ${metadata.owner?.split('@')[0] || 'Unknown'}
👥 *Total Member:* ${participants.length} orang
🛡️ *Admin:* ${admins.length} orang
🔗 *Group ID:* ${metadata.id}
📅 *Dibuat:* ${new Date(metadata.creation * 1000).toLocaleDateString()}
🔒 *Status:* ${metadata.announce ? 'Terkunci (hanya admin)' : 'Terbuka (semua bisa chat)'}
        
*Bot Status:* ${participants.find(p => p.id === sock.user.id) ? '✅ Ada di grup' : '❌ Tidak ada di grup'}
        `;
        
        await sock.sendMessage(groupJid, { text: groupInfo });
    } catch (error) {
        console.error('Group info error:', error);
        await sock.sendMessage(groupJid, { text: '❌ Gagal mendapatkan info grup.' });
    }
}

// 21. Link Group
async function linkCommand(sock, message) {
    const groupJid = message.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us')) {
        return sock.sendMessage(groupJid, { text: '❌ Command ini hanya untuk grup!' });
    }
    
    try {
        const code = await sock.groupInviteCode(groupJid);
        const inviteLink = `https://chat.whatsapp.com/${code}`;
        
        await sock.sendMessage(groupJid, { 
            text: `*Group Invite Link*\n\n🔗 ${inviteLink}\n\nShare link ini untuk mengundang orang ke grup.` 
        });
    } catch (error) {
        console.error('Link error:', error);
        await sock.sendMessage(groupJid, { text: '❌ Gagal membuat link grup. Pastikan bot adalah admin.' });
    }
}

// 22. Tebak Kata Game
async function tebakkataCommand(sock, message) {
    const gameId = message.key.remoteJid;
    const randomGame = tebakkataData[Math.floor(Math.random() * tebakkataData.length)];
    
    activeGames[gameId] = {
        type: 'tebakkata',
        answer: randomGame.jawab.toLowerCase(),
        timestamp: Date.now()
    };
    
    await sock.sendMessage(gameId, { 
        text: `*Game Tebak Kata* 🎮\n\n${randomGame.soal}\n\nJawab dengan mengetik jawaban kamu!` 
    });
    
    // Set timeout untuk game (5 menit)
    setTimeout(() => {
        if (activeGames[gameId]) {
            delete activeGames[gameId];
        }
    }, 5 * 60 * 1000);
}

// 23. Math Quiz Game
async function mathquizCommand(sock, message) {
    const gameId = message.key.remoteJid;
    const num1 = Math.floor(Math.random() * 50) + 1;
    const num2 = Math.floor(Math.random() * 50) + 1;
    const operators = ['+', '-', '*'];
    const operator = operators[Math.floor(Math.random() * operators.length)];
    
    let answer;
    switch(operator) {
        case '+': answer = num1 + num2; break;
        case '-': answer = num1 - num2; break;
        case '*': answer = num1 * num2; break;
    }
    
    activeGames[gameId] = {
        type: 'mathquiz',
        answer: answer.toString(),
        timestamp: Date.now()
    };
    
    await sock.sendMessage(gameId, { 
        text: `*Math Quiz* 🧮\n\nBerapakah hasil dari: ${num1} ${operator} ${num2} ?\n\nJawab dengan angka!` 
    });
    
    setTimeout(() => {
        if (activeGames[gameId]) {
            delete activeGames[gameId];
        }
    }, 3 * 60 * 1000);
}

// 24. Tebak Angka Game
async function tebakangkaCommand(sock, message) {
    const gameId = message.key.remoteJid;
    const answer = Math.floor(Math.random() * 100) + 1;
    
    activeGames[gameId] = {
        type: 'tebakangka',
        answer: answer.toString(),
        timestamp: Date.now(),
        attempts: 0,
        hints: 0
    };
    
    await sock.sendMessage(gameId, { 
        text: `*Game Tebak Angka* 🎯\n\nSaya memikirkan angka antara 1-100.\nTebak angka yang saya pikirkan!\n\nKetik .hint untuk mendapatkan petunjuk.` 
    });
    
    setTimeout(() => {
        if (activeGames[gameId]) {
            delete activeGames[gameId];
        }
    }, 5 * 60 * 1000);
}

// 25. Cek Fun (Random Percentage)
function cekFun(sock, message, text, type) {
    const mentions = parseMention(text);
    const senderJid = message.key.participant || message.key.remoteJid;
    
    if (mentions.length === 0) {
        // Jika tidak ada mention, cek diri sendiri
        const percentage = Math.floor(Math.random() * 101);
        const types = {
            'iman': 'Kadar iman',
            'femboy': 'Kadar femboy',
            'furry': 'Kadar furry',
            'jamet': 'Kadar jamet'
        };
        
        sock.sendMessage(message.key.remoteJid, { 
            text: `${types[type]} kamu: ${percentage}% ${percentage > 70 ? '😱' : percentage > 40 ? '😅' : '😌'}` 
        }, { quoted: message });
    } else {
        // Jika ada mention, cek orang yang di-tag
        const target = mentions[0];
        const percentage = Math.floor(Math.random() * 101);
        const types = {
            'iman': 'Kadar iman',
            'femboy': 'Kadar femboy',
            'furry': 'Kadar furry',
            'jamet': 'Kadar jamet'
        };
        
        sock.sendMessage(message.key.remoteJid, { 
            text: `${types[type]} orang itu: ${percentage}%`,
            mentions: [target]
        }, { quoted: message });
    }
}

// 26. Game Handler untuk jawaban
async function handleGameAnswer(sock, message) {
    const gameId = message.key.remoteJid;
    const game = activeGames[gameId];
    
    if (!game) return false;
    
    const userAnswer = extractMessageText(message).toLowerCase().trim();
    const senderJid = message.key.participant || message.key.remoteJid;
    
    if (game.type === 'tebakkata') {
        if (userAnswer === game.answer) {
            delete activeGames[gameId];
            await sock.sendMessage(gameId, { 
                text: `🎉 *Benar!*\nJawaban: ${game.answer}\n\nSelamat ${senderJid.split('@')[0]}!` 
            }, { quoted: message });
            return true;
        }
    } else if (game.type === 'mathquiz') {
        if (userAnswer === game.answer) {
            delete activeGames[gameId];
            await sock.sendMessage(gameId, { 
                text: `🎉 *Benar!*\nJawaban: ${game.answer}\n\nSelamat ${senderJid.split('@')[0]}!` 
            }, { quoted: message });
            return true;
        }
    } else if (game.type === 'tebakangka') {
        game.attempts++;
        const userNum = parseInt(userAnswer);
        const answerNum = parseInt(game.answer);
        
        if (isNaN(userNum)) return false;
        
        if (userNum === answerNum) {
            delete activeGames[gameId];
            await sock.sendMessage(gameId, { 
                text: `🎉 *Benar!*\nAngka yang saya pikirkan: ${game.answer}\n\nKamu menebak dalam ${game.attempts} percobaan!\nSelamat ${senderJid.split('@')[0]}!` 
            }, { quoted: message });
            return true;
        } else {
            let hint = '';
            if (userNum < answerNum) {
                hint = '📈 Angka terlalu kecil!';
            } else {
                hint = '📉 Angka terlalu besar!';
            }
            
            // Beri hint setiap 3 percobaan
            if (game.attempts % 3 === 0 && game.hints < 3) {
                game.hints++;
                const rangeHint = `Angka antara ${Math.max(1, answerNum - 10)} dan ${Math.min(100, answerNum + 10)}`;
                await sock.sendMessage(gameId, { 
                    text: `❌ Salah!\n${hint}\n\n💡 *Hint ${game.hints}:* ${rangeHint}` 
                }, { quoted: message });
            } else {
                await sock.sendMessage(gameId, { 
                    text: `❌ Salah!\n${hint}` 
                }, { quoted: message });
            }
            return true;
        }
    }
    
    return false;
}

// 27. Hint untuk tebakangka
async function hintCommand(sock, message) {
    const gameId = message.key.remoteJid;
    const game = activeGames[gameId];
    
    if (!game || game.type !== 'tebakangka') {
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Tidak ada game tebak angka yang aktif!' });
    }
    
    if (game.hints >= 3) {
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Sudah menggunakan semua hint!' });
    }
    
    game.hints++;
    const answerNum = parseInt(game.answer);
    let hint;
    
    switch(game.hints) {
        case 1:
            hint = `Angka ini ${answerNum % 2 === 0 ? 'genap' : 'ganjil'}`;
            break;
        case 2:
            hint = `Angka ini ${answerNum > 50 ? 'lebih dari' : 'kurang dari atau sama dengan'} 50`;
            break;
        case 3:
            const tens = Math.floor(answerNum / 10) * 10;
            hint = `Angka ini berada di antara ${tens} dan ${tens + 10}`;
            break;
    }
    
    await sock.sendMessage(message.key.remoteJid, { 
        text: `💡 *Hint ${game.hints}:* ${hint}` 
    });
}

// --- FUNGSI UTAMA BOT ---
async function startBot() {
    console.log('Memulai bot WhatsApp...');

    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Menggunakan WA Web v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        defaultStoreOptions: { syncHistory: false }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('Scan QR code ini dengan WhatsApp Anda:');
            qrcode.generate(qr, { small: true });
            // Tampilkan URL QR untuk Railway
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`;
            console.log(`Atau buka link ini di browser: ${qrUrl}`);
        }
        if (connection === 'close') {
            const shouldReconnect = new Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus. Mencoba reconnect dalam 5 detik...');
            if (shouldReconnect) {
                setTimeout(() => startBot(), 5000);
            }
        } else if (connection === 'open') {
            console.log('✅ Bot berhasil terhubung!');
        }
    });

    // Listener untuk pesan masuk
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message) return;
        if (msg.message.protocolMessage) return;
        if (msg.key.fromMe) return;

        const senderJid = msg.key.participant || msg.key.remoteJid;
        const messageText = extractMessageText(msg);
        
        // Cek apakah ini jawaban game
        const isGameAnswer = await handleGameAnswer(sock, msg);
        if (isGameAnswer) return;
        
        if (!messageText.startsWith(botPrefix)) return;

        const command = messageText.toLowerCase().trim().split(/ +/)[0];
        
        console.log(`\n--- Pesan Masuk ---`);
        console.log(`Dari: ${senderJid}`);
        console.log(`Command: ${command}`);
        console.log(`--------------------\n`);

        // --- SISTEM VERIFIKASI & SELF ---
        if (command !== '.verify' && !(await isUserVerified(senderJid))) {
            return sock.sendMessage(msg.key.remoteJid, { text: '❌ Kamu belum terverifikasi. Ketik *.verify* untuk menggunakan bot.' });
        }
        if (selfMode && !isOwner(senderJid)) {
            return;
        }
        // --- AKHIR SISTEM ---

        try {
            switch (command) {
                case '.menu': case '.help': await showMenu(sock, msg); break;
                case '.verify': await verifyCommand(sock, msg); break;
                case '.self': await selfCommand(sock, msg); break;
                case '.unself': await unselfCommand(sock, msg); break;
                case '.tos': case '.tiktok': await tosCommand(sock, msg, messageText); break;
                case '.ig': await igCommand(sock, msg, messageText); break;
                case '.playyt': await playytCommand(sock, msg, messageText); break;
                case '.yt': await ytCommand(sock, msg, messageText); break;
                case '.stiker': await stikerCommand(sock, msg, messageText); break;
                case '.tostiker': await tostikerCommand(sock, msg); break;
                case '.tomedia': await tomediaCommand(sock, msg); break;
                case '.grup': await grupCommand(sock, msg, messageText); break;
                case '.totag': await totagCommand(sock, msg, messageText); break;
                case '.kick': await kickCommand(sock, msg, messageText); break;
                case '.ban': await banCommand(sock, msg, messageText); break;
                case '.github': await githubCommand(sock, msg, messageText); break;
                case '.npm': await npmCommand(sock, msg, messageText); break;
                case '.gclone': await gcloneCommand(sock, msg, messageText); break;
                case '.apistatus': await apistatusCommand(sock, msg); break;
                case '.log': await logCommand(sock, msg); break;
                case '.gig': await gigCommand(sock, msg); break;
                case '.link': await linkCommand(sock, msg); break;
                case '.tebakkata': await tebakkataCommand(sock, msg); break;
                case '.mathquiz': await mathquizCommand(sock, msg); break;
                case '.tebakangka': await tebakangkaCommand(sock, msg); break;
                case '.hint': await hintCommand(sock, msg); break;
                case '.cekiman': cekFun(sock, msg, messageText, 'iman'); break;
                case '.cekfemboy': cekFun(sock, msg, messageText, 'femboy'); break;
                case '.cekfurry': cekFun(sock, msg, messageText, 'furry'); break;
                case '.cekjamet': cekFun(sock, msg, messageText, 'jamet'); break;
                case '.ping': await sock.sendMessage(msg.key.remoteJid, { text: '🏓 Pong!' }); break;
                default: await sock.sendMessage(msg.key.remoteJid, { text: `❌ Command "${command}" tidak ditemukan. Ketik .menu` }); break;
            }
        } catch (error) {
            console.error(`❌ Error saat menjalankan command ${command}:`, error);
            await sock.sendMessage(msg.key.remoteJid, { text: '❌ Maaf, terjadi kesalahan.' });
        }
    });
}

// Jalankan bot
startBot().catch(err => {
    console.error("Gagal menjalankan bot:", err);
});
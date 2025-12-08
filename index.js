// index.js - Versi Railway Ready (Instagram Scraper Fixed)

import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, downloadContentFromMessage, jidDecode } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import fetch from 'node-fetch';
import ytdl from 'ytdl-core';
import os from 'os';
import osUtils from 'os-utils';
import sqlite from 'sqlite3';
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
function isUserVerified(jid) {
    return new Promise((resolve, reject) => {
        const db = new sqlite.Database(dbPath);
        db.get('SELECT jid FROM verified_users WHERE jid = ?', [jid], (err, row) => {
            if (err) reject(err);
            else resolve(!!row);
        });
        db.close();
    });
}

function addUserToDatabase(jid) {
    return new Promise((resolve, reject) => {
        const db = new sqlite.Database(dbPath);
        db.run('INSERT OR IGNORE INTO verified_users (jid) VALUES (?)', [jid], function(err) {
            if (err) reject(err);
            else resolve();
        });
        db.close();
    });
}
// -------------------------

// --- FUNGSI HELPER ---
function extractMessageText(msg) {
    const msgType = Object.keys(msg.message)[0];
    if (msgType === 'conversation') return msg.message.conversation;
    if (msgType === 'extendedTextMessage') return msg.message.extendedTextMessage.text;
    if (msgType === 'imageMessage') return msg.message.imageMessage.caption;
    if (msgType === 'videoMessage') return msg.message.videoMessage.caption;
    return '';
}

function parseMention(text) {
    return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(v => v[1] + '@s.whatsapp.net');
}

// --- FUNGSI-FUNGSI FITUR ---

// 1. Menu (Teks Saja untuk Railway)
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
│ • .playyt <link>
│ • .yt <url>
│ • .ig <url>
│ • .tostiker <reply img/vid>
│ • .tomedia <reply stiker>
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗔𝗗𝗠𝗜𝗡 ⧽━╾❐
│ • .kick <@..>
│ • .ban <@..>
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

// 3. Self / Unself
async function selfCommand(sock, message) {
    selfMode = true;
    return sock.sendMessage(message.key.remoteJid, { text: '✅ Mode self diaktifkan.' });
}

async function unselfCommand(sock, message) {
    selfMode = false;
    return sock.sendMessage(message.key.remoteJid, { text: '✅ Mode self dinonaktifkan.' });
}

// 4. TikTok Downloader
async function tosCommand(sock, message, text) {
    const url = text.split(' ')[1];
    if (!url) return sock.sendMessage(message.key.remoteJid, { text: 'Kirim link TikToknya!' });
    try {
        const { result } = await import('@tobyg74/tiktok-api-dl');
        const data = await result(url);
        let resultText = `*TikTok Downloader*\n\n🎵 *Judul:* ${data.title}\n\n`;
        if (data.type === 'video') {
            await sock.sendMessage(message.key.remoteJid, { video: { url: data.video[0] }, caption: resultText });
        } else if (data.type === 'image') {
            for (const imageUrl of data.images) {
                await sock.sendMessage(message.key.remoteJid, { image: { url: imageUrl } });
            }
            await sock.sendMessage(message.key.remoteJid, { text: resultText });
        }
    } catch (error) {
        console.error(error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mendownload. Pastikan link benar.' });
    }
}

// 5. Instagram Downloader (FIXED)
async function igCommand(sock, message, text) {
    const url = text.split(' ')[1];
    if (!url) return sock.sendMessage(message.key.remoteJid, { text: 'Kirim link Instagramnya!' });
    try {
        const { Insta } = await import('instagram-scraper');
        const insta = new Insta();
        const data = await insta.getPost(url);

        if (data && data.media) {
            for (const item of data.media) {
                if (item.type === 'image') {
                    await sock.sendMessage(message.key.remoteJid, { image: { url: item.url } });
                } else if (item.type === 'video') {
                    await sock.sendMessage(message.key.remoteJid, { video: { url: item.url } });
                }
            }
            await sock.sendMessage(message.key.remoteJid, { text: `*Instagram Downloader*\n\n👤 *Author:* ${data.author.username}\n💬 *Caption:* ${data.caption || 'No caption'}` });
        } else {
            throw new Error('Tidak dapat mengambil data dari Instagram.');
        }
    } catch (error) {
        console.error(error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mendownload. Pastikan link benar dan bukan akun privat.' });
    }
}

// 6. YouTube Downloader (PlayYT)
async function playytCommand(sock, message, text) {
    const query = text.slice(8).trim();
    if (!query) return sock.sendMessage(message.key.remoteJid, { text: 'Masukkan judul lagu!' });
    try {
        const searchResults = await ytdl.search(query, { limit: 1 });
        if (searchResults.length === 0) throw new Error('Lagu tidak ditemukan');
        const video = searchResults[0];
        const stream = ytdl(video.videoDetails.video_url, { filter: 'audioonly', quality: 'highestaudio' });
        const tempPath = path.join('/tmp', `temp_audio_${Date.now()}.mp3`); // Simpan di /tmp
        await writeFile(tempPath, stream);
        await sock.sendMessage(message.key.remoteJid, { audio: { url: tempPath }, mimetype: 'audio/mpeg' });
        await unlink(tempPath);
    } catch (error) {
        console.error(error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mengunduh lagu.' });
    }
}

// 7. To Stiker (Image/Video to Sticker)
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
        await sock.sendMessage(message.key.remoteJid, { sticker: buffer }, { quoted: message });
    } catch (error) {
        console.error("Gagal membuat stiker:", error);
        return sock.sendMessage(message.key.remoteJid, { text: 'Gagal membuat stiker.' });
    }
}

// 8. To Media (Sticker to Image/Video)
async function tomediaCommand(sock, message) {
    const msgType = Object.keys(message.message)[0];
    if (msgType !== 'stickerMessage') {
        return sock.sendMessage(message.key.remoteJid, { text: 'Reply stiker dengan caption .tomedia' });
    }
    try {
        const stream = await downloadContentFromMessage(message.message.stickerMessage, 'sticker');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        await sock.sendMessage(message.key.remoteJid, { image: buffer }, { quoted: message });
    } catch (error) {
        console.error("Gagal mengkonversi stiker:", error);
        return sock.sendMessage(message.key.remoteJid, { text: 'Gagal mengkonversi stiker ke media.' });
    }
}

// 9. Group Open/Close
async function grupCommand(sock, message, text, senderJid) {
    const isGroup = message.key.remoteJid.endsWith('@g.us');
    if (!isGroup) return sock.sendMessage(senderJid, { text: 'Fitur ini hanya untuk grup!' });
    
    const groupMetadata = await sock.groupMetadata(message.key.remoteJid);
    const isAdmin = groupMetadata.participants.find(p => p.id === senderJid)?.admin;
    const isBotAdmin = groupMetadata.participants.find(p => p.id === sock.user.id)?.admin;

    if (!isAdmin && !senderJid.includes(ownerNumber.replace('@s.whatsapp.net', ''))) {
        return sock.sendMessage(senderJid, { text: 'Fitur ini hanya untuk admin grup!' });
    }
    if (!isBotAdmin) {
        return sock.sendMessage(senderJid, { text: 'Bot harus menjadi admin untuk menggunakan fitur ini!' });
    }

    const action = text.split(' ')[1]?.toLowerCase();
    if (action === 'buka') {
        await sock.groupSettingUpdate(message.key.remoteJid, 'not_announcement');
        await sock.sendMessage(senderJid, { text: '✅ Grup telah dibuka.' });
    } else if (action === 'tutup') {
        await sock.groupSettingUpdate(message.key.remoteJid, 'announcement');
        await sock.sendMessage(senderJid, { text: '✅ Grup telah ditutup.' });
    } else {
        await sock.sendMessage(senderJid, { text: 'Pilih *buka* atau *tutup*.' });
    }
}

// 10. Tag All (Totag)
async function totagCommand(sock, message, text, senderJid) {
    const isGroup = message.key.remoteJid.endsWith('@g.us');
    if (!isGroup) return sock.sendMessage(senderJid, { text: 'Fitur ini hanya untuk grup!' });
    
    const groupMetadata = await sock.groupMetadata(message.key.remoteJid);
    const isAdmin = groupMetadata.participants.find(p => p.id === senderJid)?.admin;

    if (!isAdmin && !senderJid.includes(ownerNumber.replace('@s.whatsapp.net', ''))) {
        return sock.sendMessage(senderJid, { text: 'Fitur ini hanya untuk admin!' });
    }

    const participants = groupMetadata.participants.map(p => p.id);
    const mentions = participants;
    const msgToTag = text.slice(7).trim() || 'Pesan dari admin';

    await sock.sendMessage(message.key.remoteJid, { text: msgToTag, mentions }, { quoted: message });
}

// 11. GitHub Info
async function githubCommand(sock, message, text) {
    const username = text.split(' ')[1];
    if (!username) return sock.sendMessage(message.key.remoteJid, { text: 'Masukkan username GitHub.' });
    try {
        const { data } = await axios.get(`https://api.github.com/users/${username}`);
        const resultText = `*GitHub Profile*\n\n👤 *Username:* ${data.login}\n📝 *Name:* ${data.name || 'No name'}\n📊 *Public Repos:* ${data.public_repos}\n👥 *Followers:* ${data.followers}\n🔗 *Profile:* ${data.html_url}`;
        await sock.sendMessage(message.key.remoteJid, { text: resultText });
    } catch (error) {
        await sock.sendMessage(message.key.remoteJid, { text: '❌ User tidak ditemukan.' });
    }
}

// 12. NPM Info
async function npmCommand(sock, message, text) {
    const packageName = text.split(' ')[1];
    if (!packageName) return sock.sendMessage(message.key.remoteJid, { text: 'Masukkan nama package.' });
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

// 13. Cek Fun (Random Percentage)
function cekFun(sock, message, text, type) {
    const mentions = parseMention(text);
    if (mentions.length === 0) return sock.sendMessage(message.key.remoteJid, { text: `Tag orang yang ingin dicek ${type}!` });
    const target = mentions[0];
    const percentage = Math.floor(Math.random() * 101);
    sock.sendMessage(message.key.remoteJid, { text: `Orang itu ${type}: ${percentage}%`, mentions: [target] }, { quoted: message });
}

// --- FUNGSI UTAMA BOT ---
async function startBot() {
    console.log('Memulai bot WhatsApp...');

    // Inisialisasi database
    const db = new sqlite.Database(dbPath);
    db.run('CREATE TABLE IF NOT EXISTS verified_users (jid TEXT PRIMARY KEY)', (err) => {
        if (err) console.error('Gagal membuat tabel:', err.message);
        else console.log('✅ Database siap.');
    });
    db.close();

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

        const senderJid = msg.key.remoteJid;
        const messageText = extractMessageText(msg);
        if (!messageText.startsWith(botPrefix)) return;

        const commandName = messageText.toLowerCase().trim().split(/ +/)[0];
        const args = messageText.trim().split(/ +/);
        const command = args.shift().toLowerCase();

        console.log(`\n--- Pesan Masuk ---`);
        console.log(`Dari: ${senderJid}`);
        console.log(`Command: ${command}`);
        console.log(`--------------------\n`);

        // --- SISTEM VERIFIKASI & SELF ---
        if (command !== '.verify' && !(await isUserVerified(senderJid))) {
            return sock.sendMessage(senderJid, { text: '❌ Kamu belum terverifikasi. Ketik *.verify* untuk menggunakan bot.' });
        }
        if (selfMode && senderJid !== ownerNumber) {
            return;
        }
        // --- AKHIR SISTEM ---

        try {
            switch (command) {
                case '.menu': case '.help': await showMenu(sock, msg); break;
                case '.verify': await verifyCommand(sock, msg); break;
                case '.self': if (senderJid === ownerNumber) await selfCommand(sock, msg); break;
                case '.unself': if (senderJid === ownerNumber) await unselfCommand(sock, msg); break;
                case '.tos': case '.tostiktok': await tosCommand(sock, msg, messageText); break;
                case '.ig': await igCommand(sock, msg, messageText); break;
                case '.playyt': await playytCommand(sock, msg, messageText); break;
                case '.tostiker': await tostikerCommand(sock, msg); break;
                case '.tomedia': await tomediaCommand(sock, msg); break;
                case '.grup': await grupCommand(sock, msg, messageText, senderJid); break;
                case '.totag': await totagCommand(sock, msg, messageText, senderJid); break;
                case '.github': await githubCommand(sock, msg, messageText); break;
                case '.npm': await npmCommand(sock, msg, messageText); break;
                case '.cekiman': cekFun(sock, msg, messageText, 'iman'); break;
                case '.cekfemboy': cekFun(sock, msg, messageText, 'femboy'); break;
                case '.cekfurry': cekFun(sock, msg, messageText, 'furry'); break;
                case '.cekjamet': cekFun(sock, msg, messageText, 'jamet'); break;
                case '.ping': await sock.sendMessage(senderJid, { text: 'Pong!' }); break;
                default: await sock.sendMessage(senderJid, { text: `Command "${command}" tidak ditemukan. Ketik .menu` }); break;
            }
        } catch (error) {
            console.error(`❌ Error saat menjalankan command ${command}:`, error);
            await sock.sendMessage(senderJid, { text: 'Maaf, terjadi kesalahan.' });
        }
    });
}

// Jalankan bot
startBot().catch(err => {
    console.error("Gagal menjalankan bot:", err);
});
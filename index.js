// C:\$dirBotWa\Bot\index.js

import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import fs from 'fs-extra';
import Pino from 'pino';
import os from 'os';
import { cpu, mem, drive } from 'node-os-utils';
import yts from 'yt-search';
import ytdl from 'ytdl-core';
import { fileTypeFromBuffer } from 'file-type';
import ig from 'instagram-url-direct';
import { TiktokDL } from 'tiktok-scraper';
import axios from 'axios';

// --- KONFIGURASI ---
const logger = Pino({ level: 'silent' });
const ownerNumber = process.env.OWNER_NUMBER + '@s.whatsapp.net';
const games = new Map(); // Menyimpan state game per chat

// --- FUNGSI HELPER (UTILS, SCRAPER, DOWNLOADER) ---

export async function getSystemInfo() {
    const cpuUsage = await cpu.usage();
    const memInfo = await mem.info();
    const driveInfo = await drive.info();
    return {
        cpu: cpuUsage.toFixed(1),
        ram: `${memInfo.usedMemMb} MB / ${memInfo.totalMemMb} MB`,
        disk: `${driveInfo.usedGb} GB / ${driveInfo.totalGb} GB`,
    };
}

export async function npmSearch(packageName) {
    try {
        const { data } = await axios.get(`https://registry.npmjs.org/${packageName}`);
        return {
            name: data.name,
            version: data['dist-tags'].latest,
            description: data.description,
            author: data.author?.name || 'Unknown',
        };
    } catch (e) {
        return null;
    }
}

export async function githubInfo(url) {
    try {
        const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (!match) return null;
        const [, owner, repo] = match;
        const { data } = await axios.get(`https://api.github.com/repos/${owner}/${repo}`);
        return {
            name: data.name,
            fullName: data.full_name,
            description: data.description,
            stars: data.stargazers_count,
            forks: data.forks_count,
            language: data.language,
            url: data.html_url,
        };
    } catch (e) {
        return null;
    }
}

export async function ytDownloader(url, sock, msg, type = 'video') {
    try {
        const search = await yts(url);
        const video = search.videos[0];
        if (!video) return sock.sendMessage(msg.key.remoteJid, { text: '❌ Video tidak ditemukan!' }, { quoted: msg });

        const stream = ytdl(url, { quality: type === 'video' ? 'highest' : 'highestaudio' });
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        const { mime } = await fileTypeFromBuffer(buffer);

        await sock.sendMessage(msg.key.remoteJid, {
            [type.split(':')[0]]: buffer,
            mimetype: mime,
            caption: `✅ *${type === 'video' ? 'Video' : 'Audio'} dari YouTube*\n\n📌 *Judul:* ${video.title}\n👁️ *Views:* ${video.views}\n⏱️ *Durasi:* ${video.timestamp}`
        }, { quoted: msg });
    } catch (e) {
        console.error(e);
        sock.sendMessage(msg.key.remoteJid, { text: '❌ Gagal mengunduh dari YouTube!' }, { quoted: msg });
    }
}

export async function igDownloader(url, sock, msg) {
    try {
        const results = await ig(url);
        if (!results.url_list || results.url_list.length === 0) throw new Error("No media found");
        for (const mediaUrl of results.url_list) {
            const { data } = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
            const { mime } = await fileTypeFromBuffer(data);
            await sock.sendMessage(msg.key.remoteJid, {
                [mime.split('/')[0]]: data,
                mimetype: mime,
                caption: '✅ *Media dari Instagram*'
            }, { quoted: msg });
        }
    } catch (e) {
        console.error(e);
        sock.sendMessage(msg.key.remoteJid, { text: '❌ Gagal mengunduh dari Instagram!' }, { quoted: msg });
    }
}

export async function ttDownloader(url, sock, msg) {
    try {
        const result = await TiktokDL(url, { noWatermark: true, version: 'v1' });
        if (!result.status) throw new Error("Failed to fetch");
        const { data } = await axios.get(result.result.video, { responseType: 'arraybuffer' });
        const { mime } = await fileTypeFromBuffer(data);
        await sock.sendMessage(msg.key.remoteJid, {
            video: data,
            mimetype: mime,
            caption: `✅ *Video dari TikTok*\n\n👤 *Author:* ${result.result.author.nickname}`
        }, { quoted: msg });
    } catch (e) {
        console.error(e);
        sock.sendMessage(msg.key.remoteJid, { text: '❌ Gagal mengunduh dari TikTok!' }, { quoted: msg });
    }
}

// --- FUNGSI GAME ---
const kataKata = ['nodejs', 'javascript', 'python', 'programming', 'computer', 'algorithm', 'database', 'framework', 'library', 'developer'];
const angkaRandom = () => Math.floor(Math.random() * 100) + 1;

export async function gameHandler(sock, msg) {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || from;
    const body = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    
    if (!games.has(from)) return false;
    const currentGame = games.get(from);
    
    if ((currentGame.type === 'tebakkata' && body.toLowerCase() === currentGame.answer.toLowerCase()) ||
        (currentGame.type !== 'tebakkata' && parseInt(body) === currentGame.answer)) {
        await sock.sendMessage(from, { text: `🎉 Benar! Jawabannya adalah *${currentGame.answer}*\n\nDijawab oleh @${sender.split('@')[0]}`, mentions: [sender] }, { quoted: msg });
        games.delete(from);
        return true;
    }
    return false;
}

export function startGame(chatId, type, sock, msg) {
    if (games.has(chatId)) return sock.sendMessage(chatId, { text: '⚠️ Masih ada game yang belum selesai di chat ini!' }, { quoted: msg });
    let question, answer;
    switch (type) {
        case 'tebakkata':
            answer = kataKata[Math.floor(Math.random() * kataKata.length)];
            question = `🎮 *Tebak Kata*\n\nApa kata yang tersembunyi?\n\n_${answer.replace(/./g, '_')}_\n\nPetunjuk: Kata ini memiliki ${answer.length} huruf.`;
            break;
        case 'tebakangka':
            answer = angkaRandom();
            question = `🔢 *Tebak Angka*\n\nSaya telah memilih angka antara 1 hingga 100.\nCoba tebak angka berapa!`;
            break;
        case 'mathquiz':
            const num1 = Math.floor(Math.random() * 20) + 1;
            const num2 = Math.floor(Math.random() * 20) + 1;
            const operator = ['+', '-', '*'][Math.floor(Math.random() * 3)];
            answer = eval(`${num1} ${operator} ${num2}`);
            question = `🧮 *Math Quiz*\n\nBerapakah hasil dari ${num1} ${operator} ${num2}?`;
            break;
    }
    games.set(chatId, { type, answer });
    sock.sendMessage(chatId, { text: question }, { quoted: msg });
}

// --- DEFINISI SEMUA COMMAND ---
const commands = new Map();

// Menu Public
commands.set('.verify', { execute: async (sock, msg) => {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || from;
    await sock.sendMessage(from, { text: `✅ Verifikasi berhasil!\n\n@${sender.split('@')[0]} telah terverifikasi.`, mentions: [sender] }, { quoted: msg });
}, category: 'public' });

commands.set('.link', { execute: async (sock, msg) => {
    const from = msg.key.remoteJid;
    if (!from.endsWith('@g.us')) return sock.sendMessage(from, { text: '❌ Perintah ini hanya untuk grup!' }, { quoted: msg });
    try { const code = await sock.groupInviteCode(from); await sock.sendMessage(from, { text: `https://chat.whatsapp.com/${code}` }, { quoted: msg }); }
    catch (e) { sock.sendMessage(from, { text: '❌ Gagal mendapatkan link grup!' }, { quoted: msg }); }
}, category: 'public' });

// Menu Games
commands.set('.tebakkata', { execute: async (sock, msg) => startGame(msg.key.remoteJid, 'tebakkata', sock, msg), category: 'public' });
commands.set('.mathquiz', { execute: async (sock, msg) => startGame(msg.key.remoteJid, 'mathquiz', sock, msg), category: 'public' });
commands.set('.tebakangka', { execute: async (sock, msg) => startGame(msg.key.remoteJid, 'tebakangka', sock, msg), category: 'public' });

// Menu Fun
const createCekCommand = (title, emoji) => async (sock, msg) => {
    const from = msg.key.remoteJid;
    const mentionedJid = msg.message.extendedTextMessage?.mentionedJid || [msg.key.participant || from];
    const target = mentionedJid[0];
    const percentage = Math.floor(Math.random() * 101);
    await sock.sendMessage(from, { text: `📊 *Cek ${title}*\n\nTingkat ${title.toLowerCase()} @${target.split('@')[0]} adalah *${percentage}%* ${percentage > 70 ? emoji[0] : percentage > 40 ? emoji[1] : emoji[2]}`, mentions: [target] }, { quoted: msg });
};
commands.set('.cekiman', { execute: createCekCommand('Iman', ['🌟', '😐', '🔥']), category: 'public' });
commands.set('.cekfemboy', { execute: createCekCommand('Femboy', ['👗', '🤔', '👨']), category: 'public' });
commands.set('.cekfurry', { execute: createCekCommand('Furry', ['🐾', '🦊', '👨']), category: 'public' });
commands.set('.cekjamet', { execute: createCekCommand('Jamet', ['🧢', '🤨', '😎']), category: 'public' });

// Menu Downloader
commands.set('.playyt', { execute: async (sock, msg, args) => {
    const query = args.join(' ');
    if (!query) return sock.sendMessage(msg.key.remoteJid, { text: '❌ Masukkan judul lagu!' }, { quoted: msg });
    const search = await yts(query);
    const video = search.videos[0];
    if (!video) return sock.sendMessage(msg.key.remoteJid, { text: '❌ Lagu tidak ditemukan!' }, { quoted: msg });
    await sock.sendMessage(msg.key.remoteJid, { text: `🎵 Sedang mengunduh: *${video.title}*` }, { quoted: msg });
    ytDownloader(video.url, sock, msg, 'audio');
}, category: 'public' });

commands.set('.yt', { execute: async (sock, msg, args) => {
    const url = args[0];
    if (!url) return sock.sendMessage(msg.key.remoteJid, { text: '❌ Masukkan link YouTube!' }, { quoted: msg });
    ytDownloader(url, sock, msg, 'video');
}, category: 'public' });

commands.set('.ig', { execute: async (sock, msg, args) => {
    const url = args[0];
    if (!url) return sock.sendMessage(msg.key.remoteJid, { text: '❌ Masukkan link Instagram!' }, { quoted: msg });
    igDownloader(url, sock, msg);
}, category: 'public' });

commands.set('.tt', { execute: async (sock, msg, args) => {
    const url = args[0];
    if (!url) return sock.sendMessage(msg.key.remoteJid, { text: '❌ Masukkan link TikTok!' }, { quoted: msg });
    ttDownloader(url, sock, msg);
}, category: 'public' });

// Menu Admin
commands.set('.kick', { execute: async (sock, msg) => {
    const from = msg.key.remoteJid;
    const mentionedJid = msg.message.extendedTextMessage?.mentionedJid;
    if (!mentionedJid) return sock.sendMessage(from, { text: '❌ Tag member yang ingin dikeluarkan!' }, { quoted: msg });
    await sock.groupParticipantsUpdate(from, mentionedJid, 'remove');
    await sock.sendMessage(from, { text: `✅ Member berhasil dikeluarkan.` }, { quoted: msg });
}, category: 'admin' });

commands.set('.ban', { execute: async (sock, msg) => { // Sama dengan kick
    const from = msg.key.remoteJid;
    const mentionedJid = msg.message.extendedTextMessage?.mentionedJid;
    if (!mentionedJid) return sock.sendMessage(from, { text: '❌ Tag member yang ingin dibanned!' }, { quoted: msg });
    await sock.groupParticipantsUpdate(from, mentionedJid, 'remove');
    await sock.sendMessage(from, { text: `✅ Member berhasil dibanned.` }, { quoted: msg });
}, category: 'admin' });

commands.set('.grup', { execute: async (sock, msg, args) => {
    const from = msg.key.remoteJid;
    const setting = args[0];
    if (!setting || !['buka', 'tutup'].includes(setting)) return sock.sendMessage(from, { text: '❌ Pilih *buka* atau *tutup*!' }, { quoted: msg });
    await sock.groupSettingUpdate(from, setting === 'buka' ? 'not_announcement' : 'announcement');
    await sock.sendMessage(from, { text: `✅ Grup telah ${setting === 'buka' ? 'dibuka' : 'ditutup'}.` });
}, category: 'admin' });

commands.set('.totag', { execute: async (sock, msg, args) => {
    const from = msg.key.remoteJid;
    const text = args.join(' ') || 'Pesan dari admin';
    const groupMetadata = await sock.groupMetadata(from);
    const participants = groupMetadata.participants.map(p => p.id);
    await sock.sendMessage(from, { text: text, mentions: participants }, { quoted: msg });
}, category: 'admin' });

// Menu Owner
commands.set('.npm', { execute: async (sock, msg, args) => {
    const packageName = args[0];
    if (!packageName) return sock.sendMessage(msg.key.remoteJid, { text: '❌ Masukkan nama package NPM!' }, { quoted: msg });
    const pkg = await npmSearch(packageName);
    if (!pkg) return sock.sendMessage(msg.key.remoteJid, { text: '❌ Package tidak ditemukan!' }, { quoted: msg });
    const infoText = `📦 *Info Package NPM*\n\n📌 *Nama:* ${pkg.name}\n🏷️ *Versi:* ${pkg.version}\n📝 *Deskripsi:* ${pkg.description}\n👤 *Author:* ${pkg.author}`;
    sock.sendMessage(msg.key.remoteJid, { text: infoText }, { quoted: msg });
}, category: 'owner' });

commands.set('.gclone', { execute: async (sock, msg, args) => {
    const url = args[0];
    if (!url) return sock.sendMessage(msg.key.remoteJid, { text: '❌ Masukkan link repository GitHub!' }, { quoted: msg });
    const repo = await githubInfo(url);
    if (!repo) return sock.sendMessage(msg.key.remoteJid, { text: '❌ Repository tidak ditemukan!' }, { quoted: msg });
    const infoText = `🐙 *Info Repository GitHub*\n\n📌 *Nama:* ${repo.fullName}\n📝 *Deskripsi:* ${repo.description}\n⭐ *Stars:* ${repo.stars}\n🍴 *Forks:* ${repo.forks}\n💻 *Bahasa:* ${repo.language}\n🔗 *Link:* ${repo.url}`;
    sock.sendMessage(msg.key.remoteJid, { text: infoText }, { quoted: msg });
}, category: 'owner' });

commands.set('.apistatus', { execute: async (sock, msg) => {
    const apis = [{ name: 'NPM Registry', url: 'https://registry.npmjs.org/' }, { name: 'GitHub API', url: 'https://api.github.com/' }];
    let statusText = '📊 *Status API Eksternal*\n\n';
    const results = await Promise.allSettled(apis.map(api => axios.get(api.url, { timeout: 5000 })));
    results.forEach((result, index) => {
        const api = apis[index];
        statusText += result.status === 'fulfilled' ? `✅ ${api.name}: Online\n` : `❌ ${api.name}: Offline / Error\n`;
    });
    sock.sendMessage(msg.key.remoteJid, { text: statusText }, { quoted: msg });
}, category: 'owner' });


// --- FUNGSI UTAMA KONEKSI DAN HANDLER ---
async function connectToWhatsApp() {
    console.log('Memulai koneksi ke WhatsApp...');
    const { state, saveCreds } = await useMultiFileAuthState('./sessions');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
        version, logger, printQRInTerminal: false, auth: state,
        browser: ['Windbi Bot', 'Chrome', '4.0.0'],
    });

    sock.ev.on('connection.update', (update) => {
        const { qr, connection, lastDisconnect } = update;
        if (qr) { console.log('Scan QR Code ini untuk menghubungkan bot:'); qrcode.generate(qr, { small: true }); }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus, mencoba hubungkan kembali...', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ Bot berhasil terhubung!');
        }
    });
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
        
        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        const sender = msg.key.participant || from;
        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const args = body.trim().split(/ +/).slice(1);
        const command = body.trim().toLowerCase().split(' ')[0];

        // Cek permission
        const isOwner = sender === ownerNumber;
        let isAdmin = false;
        if (isGroup) {
            const groupMetadata = await sock.groupMetadata(from);
            isAdmin = groupMetadata.participants.some(p => p.id === sender && (p.admin === 'admin' || p.admin === 'superadmin'));
        }

        // Handler Game
        if (await gameHandler(sock, msg)) return;

        // Menu Utama
        if (command === '.menu' || command === '.help') {
            const systemInfo = await getSystemInfo();
            const menuText = `
╭╼━━━━━━━━━━━━━━━━━━━━╾❐
│ 𝗪𝗜𝗡𝗗𝗕𝗜 𝗕𝗢𝗧 𝗪𝗛𝗔𝗧𝗦𝗔𝗣𝗣
├╼━━━━━━━━━━━━━━━━━━━━╾╮
│ 𝗨𝗣𝗧𝗜𝗠𝗘 𝗦𝗬𝗦𝗧𝗘𝗠
│ • CPU   : ${systemInfo.cpu}%
│ • RAM   : ${systemInfo.ram}
│ • DISK  : ${systemInfo.disk}
│
│ 𝗦𝗧𝗔𝗧𝗨𝗦 : ✅ Online
├╼━━━━━━━━━━━━━━━━━━━━╾〢
│ Bot ini dibuat oleh aal
│ [humpreyDev].
╰╼━━━━━━━━━━━━━━━━━━━━╾❏

> Copyright © humpreyDev`;

            const sections = [
                { title: "⧼ 𝗠𝗘𝗡𝗨 𝗣𝗨𝗕𝗟𝗜𝗞 ⧽", rows: [{ title: "Verify", rowId: ".verify" }, { title: "Link Grup", rowId: ".link" }] },
                { title: "⧼ 𝗠𝗘𝗡𝗨 𝗚𝗔𝗠𝗘𝗦 ⧽", rows: [{ title: "Tebak Kata", rowId: ".tebakkata" }, { title: "Math Quiz", rowId: ".mathquiz" }, { title: "Tebak Angka", rowId: ".tebakangka" }] },
                { title: "⧼ 𝗠𝗘𝗡𝗨 𝗙𝗨𝗡 ⧽", rows: [{ title: "Cek Iman", rowId: ".cekiman" }, { title: "Cek Femboy", rowId: ".cekfemboy" }, { title: "Cek Furry", rowId: ".cekfurry" }, { title: "Cek Jamet", rowId: ".cekjamet" }] },
                { title: "⧼ 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗥 ⧽", rows: [{ title: "Play YouTube", rowId: ".playyt" }, { title: "Download YouTube", rowId: ".yt" }, { title: "Download Instagram", rowId: ".ig" }, { title: "Download TikTok", rowId: ".tt" }] },
                { title: "⧼ 𝗠𝗘𝗡𝗨 𝗔𝗗𝗠𝗜𝗡 ⧽", rows: [{ title: "Kick Member", rowId: ".kick" }, { title: "Ban Member", rowId: ".ban" }, { title: "Grup Settings", rowId: ".grup" }, { title: "Tag All", rowId: ".totag" }] },
                { title: "⧼ 𝗠𝗘𝗡𝗨 𝗢𝗪𝗡𝗘𝗥 ⧽", rows: [{ title: "NPM Search", rowId: ".npm" }, { title: "GitHub Clone", rowId: ".gclone" }, { title: "API Status", rowId: ".apistatus" }] },
            ];

            const listMessage = { text: menuText, footer: '© humpreyDev', title: "Windbi Bot Menu", buttonText: "Pilih Menu", sections };
            await sock.sendMessage(from, listMessage);
            return;
        }

        // Eksekusi Command
        if (commands.has(command)) {
            const cmd = commands.get(command);
            if (cmd.category === 'owner' && !isOwner) return sock.sendMessage(from, { text: '❌ Perintah ini hanya untuk Owner!' }, { quoted: msg });
            if (cmd.category === 'admin' && !isOwner && !isAdmin) return sock.sendMessage(from, { text: '❌ Perintah ini hanya untuk Admin Grup!' }, { quoted: msg });
            try { await cmd.execute(sock, msg, args); }
            catch (error) { console.error(`Error executing command ${command}:`, error); sock.sendMessage(from, { text: `❌ Terjadi kesalahan saat menjalankan perintah ${command}` }, { quoted: msg }); }
        }
    });
    
    return sock;
}

// Jalankan koneksi
connectToWhatsApp().catch(err => console.error("Error saat memulai koneksi:", err));
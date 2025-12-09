// index.js
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { exec } from 'child_process';
import util from 'util';
import axios from 'axios';
import ytdl from 'ytdl-core';
import yts from 'yt-search';
import { fileTypeFromBuffer } from 'file-type';
import ig from 'instagram-url-direct';
import { TiktokDL } from 'tiktok-scraper';

// --- KONFIGURASI ---
const logger = pino({ level: 'silent' });
const ownerNumber = process.env.OWNER_NUMBER + '@s.whatsapp.net';
const prefix = '.';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = util.promisify(exec);

// Penyimpanan sementara untuk game
const games = {
    tebakkata: { active: new Map() },
    mathquiz: { active: new Map() },
    tebakangka: { active: new Map() }
};

// --- FUNGSI HELPER ---

async function getSystemInfo() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    let diskInfo = 'Tidak tersedia';
    try {
        if (process.platform !== 'win32') {
            const { stdout } = await execAsync('df -h /');
            const lines = stdout.trim().split('\n');
            if (lines.length > 1) {
                const parts = lines[1].split(/\s+/);
                diskInfo = `Used: ${parts[2]} / Total: ${parts[1]} (${parts[4]})`;
            }
        } else {
            const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption');
            const lines = stdout.trim().split('\n');
            if (lines.length > 1) {
                const parts = lines[1].trim().split(/\s+/);
                const free = (parseInt(parts[1]) / 1024 / 1024 / 1024).toFixed(2);
                const size = (parseInt(parts[2]) / 1024 / 1024 / 1024).toFixed(2);
                diskInfo = `Used: ${(size - free).toFixed(2)}GB / Total: ${size}GB`;
            }
        }
    } catch (diskError) {
        console.error('Error getting disk info:', diskError);
    }
    return { cpu: `${cpus[0].model} (${cpus.length} cores)`, ram: `${(usedMem / 1024 / 1024 / 1024).toFixed(2)}GB / ${(totalMem / 1024 / 1024 / 1024).toFixed(2)}GB`, disk: diskInfo };
}

async function npmSearch(packageName) {
    try { const { data } = await axios.get(`https://registry.npmjs.org/${packageName}`); return { name: data.name, version: data['dist-tags'].latest, description: data.description, author: data.author?.name || 'Unknown' }; }
    catch (e) { return null; }
}

async function githubInfo(url) {
    try { const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/); if (!match) return null; const [, owner, repo] = match; const { data } = await axios.get(`https://api.github.com/repos/${owner}/${repo}`); return { name: data.name, fullName: data.full_name, description: data.description, stars: data.stargazers_count, forks: data.forks_count, language: data.language, url: data.html_url }; }
    catch (e) { return null; }
}

async function ytSearchAndDownload(query, sock, msg, type = 'audio') {
    try {
        const search = await yts(query);
        if (!search.videos.length) return sock.sendMessage(msg.key.remoteJid, { text: '❌ Video tidak ditemukan!' }, { quoted: msg });
        const video = search.videos[0];
        await sock.sendMessage(msg.key.remoteJid, { text: `⏳ Mengunduh: *${video.title}*` }, { quoted: msg });
        const stream = ytdl(video.url, { quality: type === 'audio' ? 'highestaudio' : 'highestvideo' });
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        const { mime } = await fileTypeFromBuffer(buffer);
        await sock.sendMessage(msg.key.remoteJid, { [type.split(':')[0]]: buffer, mimetype: mime, fileName: `${video.title}.${type.split(':')[0] === 'audio' ? 'mp3' : 'mp4'}`, caption: `✅ *${type === 'audio' ? 'Audio' : 'Video'} dari YouTube*\n\n📌 *Judul:* ${video.title}` }, { quoted: msg });
    } catch (e) { console.error(e); sock.sendMessage(msg.key.remoteJid, { text: '❌ Gagal mengunduh dari YouTube!' }, { quoted: msg }); }
}

async function igDownloader(url, sock, msg) {
    try { const results = await ig(url); if (!results.url_list || results.url_list.length === 0) throw new Error("No media found"); for (const mediaUrl of results.url_list) { const { data } = await axios.get(mediaUrl, { responseType: 'arraybuffer' }); const { mime } = await fileTypeFromBuffer(data); await sock.sendMessage(msg.key.remoteJid, { [mime.split('/')[0]]: data, mimetype: mime, caption: '✅ *Media dari Instagram*' }, { quoted: msg }); } }
    catch (e) { console.error(e); sock.sendMessage(msg.key.remoteJid, { text: '❌ Gagal mengunduh dari Instagram!' }, { quoted: msg }); }
}

async function ttDownloader(url, sock, msg) {
    try { const result = await TiktokDL(url, { noWatermark: true, version: 'v1' }); if (!result.status) throw new Error("Failed to fetch"); const { data } = await axios.get(result.result.video, { responseType: 'arraybuffer' }); const { mime } = await fileTypeFromBuffer(data); await sock.sendMessage(msg.key.remoteJid, { video: data, mimetype: mime, caption: `✅ *Video dari TikTok*\n\n👤 *Author:* ${result.result.author.nickname}` }, { quoted: msg }); }
    catch (e) { console.error(e); sock.sendMessage(msg.key.remoteJid, { text: '❌ Gagal mengunduh dari TikTok!' }, { quoted: msg }); }
}

function checkLuck() { return `${Math.floor(Math.random() * 101)}%`; }

// --- DEFINISI SEMUA COMMAND ---
const commands = new Map();

// Menu
commands.set('menu', { execute: async (sock, msg) => {
    const from = msg.key.remoteJid; const stats = await getSystemInfo();
    const menuText = `╭╼━━━━━━━━━━━━━━━━━━━━╾❐\n│ 𝗪𝗜𝗡𝗗𝗕𝗜 𝗕𝗢𝗧 𝗪𝗛𝗔𝗧𝗦𝗔𝗣𝗣\n├╼━━━━━━━━━━━━━━━━━━━━╾╮\n│ 𝗨𝗣𝗧𝗜𝗠𝗘 𝗦𝗬𝗦𝗧𝗘𝗠\n│ • CPU   : ${stats.cpu}\n│ • RAM   : ${stats.ram}\n│ • DISK  : ${stats.disk}\n│\n│ 𝗦𝗧𝗔𝗧𝗨𝗦 : ✅ Online\n├╼━━━━━━━━━━━━━━━━━━━━╾〢\n│ Bot ini dibuat oleh aal\n│ [humpreyDev].\n╰╼━━━━━━━━━━━━━━━━━━━━╾❏\n\n> Copyright © humpreyDev`;
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
}, category: 'public' });

// Public
commands.set('verify', { execute: async (sock, msg) => { const from = msg.key.remoteJid; const sender = msg.key.participant || from; await sock.sendMessage(from, { text: `✅ Verifikasi berhasil!\n\n@${sender.split('@')[0]} telah terverifikasi.`, mentions: [sender] }, { quoted: msg }); }, category: 'public' });
commands.set('link', { execute: async (sock, msg) => { const from = msg.key.remoteJid; if (!from.endsWith('@g.us')) return sock.sendMessage(from, { text: '❌ Perintah ini hanya untuk grup!' }, { quoted: msg }); try { const code = await sock.groupInviteCode(from); await sock.sendMessage(from, { text: `https://chat.whatsapp.com/${code}` }, { quoted: msg }); } catch (e) { sock.sendMessage(from, { text: '❌ Gagal mendapatkan link grup!' }, { quoted: msg }); } }, category: 'public' });

// Games
const tebakkataQuestions = [{ q: "Apa yang selalu datang tapi tidak pernah sampai?", a: "besok" }, { q: "Apa yang punya kaki tapi tidak bisa berjalan?", a: "kursi" }];
commands.set('tebakkata', { execute: async (sock, msg) => { const from = msg.key.remoteJid; if (games.tebakkata.active.has(from)) return sock.sendMessage(from, { text: '⚠️ Masih ada game yang belum selesai!' }, { quoted: msg }); const randomQ = tebakkataQuestions[Math.floor(Math.random() * tebakkataQuestions.length)]; games.tebakkata.active.set(from, { question: randomQ.q, answer: randomQ.a }); await sock.sendMessage(from, { text: `🎮 *TEBAK KATA*\n\nPertanyaan: "${randomQ.q}"\n\nJawab dengan format: *.jawab [jawaban]*` }, { quoted: msg }); }, category: 'public' });
commands.set('mathquiz', { execute: async (sock, msg) => { const from = msg.key.remoteJid; if (games.mathquiz.active.has(from)) return sock.sendMessage(from, { text: '⚠️ Masih ada game yang belum selesai!' }, { quoted: msg }); const num1 = Math.floor(Math.random() * 100) + 1; const num2 = Math.floor(Math.random() * 50) + 1; const operators = ['+', '-', '*']; const op = operators[Math.floor(Math.random() * operators.length)]; const answer = eval(`${num1} ${op} ${num2}`); games.mathquiz.active.set(from, { question: `${num1} ${op} ${num2}`, answer }); await sock.sendMessage(from, { text: `🧮 *MATH QUIZ*\n\nSoal: ${num1} ${op} ${num2} = ?\n\nJawab dengan format: *.jawab [angka]*` }, { quoted: msg }); }, category: 'public' });
commands.set('tebakangka', { execute: async (sock, msg) => { const from = msg.key.remoteJid; if (games.tebakangka.active.has(from)) return sock.sendMessage(from, { text: '⚠️ Masih ada game yang belum selesai!' }, { quoted: msg }); const number = Math.floor(Math.random() * 100) + 1; games.tebakangka.active.set(from, { answer: number }); await sock.sendMessage(from, { text: `🔢 *TEBAK ANGKA*\n\nSaya memikirkan angka antara 1-100\n\nTebak dengan format: *.jawab [angka]*` }, { quoted: msg }); }, category: 'public' });
commands.set('jawab', { execute: async (sock, msg, args) => { const from = msg.key.remoteJid; const answer = args.join(' ').toLowerCase(); const sender = msg.key.participant || from; let responded = false; if (games.tebakkata.active.has(from)) { const game = games.tebakkata.active.get(from); if (answer === game.answer) { await sock.sendMessage(from, { text: `✅ *BENAR!*\nJawaban "${game.answer}" tepat! 🎉\n\nDijawab oleh @${sender.split('@')[0]}`, mentions: [sender] }, { quoted: msg }); games.tebakkata.active.delete(from); responded = true; } } if (games.mathquiz.active.has(from)) { const game = games.mathquiz.active.get(from); if (parseInt(answer) === game.answer) { await sock.sendMessage(from, { text: `✅ *BENAR!*\n${game.question} = ${game.answer} 🎉\n\nDijawab oleh @${sender.split('@')[0]}`, mentions: [sender] }, { quoted: msg }); games.mathquiz.active.delete(from); responded = true; } } if (games.tebakangka.active.has(from)) { const game = games.tebakangka.active.get(from); const guess = parseInt(answer); if (!isNaN(guess)) { if (guess === game.answer) { await sock.sendMessage(from, { text: `✅ *BENAR!*\nAngka ${game.answer} tepat! 🎉\n\nDitebak oleh @${sender.split('@')[0]}`, mentions: [sender] }, { quoted: msg }); games.tebakangka.active.delete(from); responded = true; } else if (guess < game.answer) { await sock.sendMessage(from, { text: '📈 *TERLALU RENDAH!*\nAngka saya lebih besar.' }, { quoted: msg }); responded = true; } else { await sock.sendMessage(from, { text: '📉 *TERLALU TINGGI!*\nAngka saya lebih kecil.' }, { quoted: msg }); responded = true; } } } if (!responded) await sock.sendMessage(from, { text: '❌ Tidak ada game aktif atau jawaban salah!' }, { quoted: msg }); }, category: 'public' });

// Fun
const createCekCommand = (title, emoji) => async (sock, msg) => { const from = msg.key.remoteJid; const mentionedJid = msg.message.extendedTextMessage?.mentionedJid || [msg.key.participant || from]; const target = mentionedJid[0]; const percentage = checkLuck(); await sock.sendMessage(from, { text: `📊 *Cek ${title}*\n\nTingkat ${title.toLowerCase()} @${target.split('@')[0]} adalah *${percentage}%* ${percentage > 70 ? emoji[0] : percentage > 40 ? emoji[1] : emoji[2]}`, mentions: [target] }, { quoted: msg }); };
commands.set('cekiman', { execute: createCekCommand('Iman', ['🌟', '😐', '🔥']), category: 'public' });
commands.set('cekfemboy', { execute: createCekCommand('Femboy', ['👗', '🤔', '👨']), category: 'public' });
commands.set('cekfurry', { execute: createCekCommand('Furry', ['🐾', '🦊', '👨']), category: 'public' });
commands.set('cekjamet', { execute: createCekCommand('Jamet', ['🧢', '🤨', '😎']), category: 'public' });

// Downloader
commands.set('playyt', { execute: async (sock, msg, args) => { const query = args.join(' '); if (!query) return sock.sendMessage(msg.key.remoteJid, { text: '❌ Masukkan judul lagu!' }, { quoted: msg }); ytSearchAndDownload(query, sock, msg, 'audio'); }, category: 'public' });
commands.set('yt', { execute: async (sock, msg, args) => { const url = args[0]; if (!url) return sock.sendMessage(msg.key.remoteJid, { text: '❌ Masukkan link YouTube!' }, { quoted: msg }); ytSearchAndDownload(url, sock, msg, 'video'); }, category: 'public' });
commands.set('ig', { execute: async (sock, msg, args) => { const url = args[0]; if (!url) return sock.sendMessage(msg.key.remoteJid, { text: '❌ Masukkan link Instagram!' }, { quoted: msg }); igDownloader(url, sock, msg); }, category: 'public' });
commands.set('tt', { execute: async (sock, msg, args) => { const url = args[0]; if (!url) return sock.sendMessage(msg.key.remoteJid, { text: '❌ Masukkan link TikTok!' }, { quoted: msg }); ttDownloader(url, sock, msg); }, category: 'public' });

// Admin
commands.set('kick', { execute: async (sock, msg) => { const from = msg.key.remoteJid; const mentionedJid = msg.message.extendedTextMessage?.mentionedJid; if (!mentionedJid) return sock.sendMessage(from, { text: '❌ Tag member yang ingin dikeluarkan!' }, { quoted: msg }); await sock.groupParticipantsUpdate(from, mentionedJid, 'remove'); await sock.sendMessage(from, { text: `✅ Member berhasil dikeluarkan.` }, { quoted: msg }); }, category: 'admin' });
commands.set('ban', { execute: async (sock, msg) => { const from = msg.key.remoteJid; const mentionedJid = msg.message.extendedTextMessage?.mentionedJid; if (!mentionedJid) return sock.sendMessage(from, { text: '❌ Tag member yang ingin dibanned!' }, { quoted: msg }); await sock.groupParticipantsUpdate(from, mentionedJid, 'remove'); await sock.sendMessage(from, { text: `✅ Member berhasil dibanned (dikeluarkan).` }, { quoted: msg }); }, category: 'admin' });
commands.set('grup', { execute: async (sock, msg, args) => { const from = msg.key.remoteJid; const setting = args[0]; if (!setting || !['buka', 'tutup'].includes(setting)) return sock.sendMessage(from, { text: '❌ Pilih *buka* atau *tutup*!' }, { quoted: msg }); await sock.groupSettingUpdate(from, setting === 'buka' ? 'not_announcement' : 'announcement'); await sock.sendMessage(from, { text: `✅ Grup telah ${setting === 'buka' ? 'dibuka' : 'ditutup'}.` }); }, category: 'admin' });
commands.set('totag', { execute: async (sock, msg, args) => { const from = msg.key.remoteJid; const text = args.join(' ') || 'Pesan dari admin'; const groupMetadata = await sock.groupMetadata(from); const participants = groupMetadata.participants.map(p => p.id); await sock.sendMessage(from, { text: text, mentions: participants }, { quoted: msg }); }, category: 'admin' });

// Owner
commands.set('npm', { execute: async (sock, msg, args) => { const packageName = args[0]; if (!packageName) return sock.sendMessage(msg.key.remoteJid, { text: '❌ Masukkan nama package NPM!' }, { quoted: msg }); const pkg = await npmSearch(packageName); if (!pkg) return sock.sendMessage(msg.key.remoteJid, { text: '❌ Package tidak ditemukan!' }, { quoted: msg }); const infoText = `📦 *Info Package NPM*\n\n📌 *Nama:* ${pkg.name}\n🏷️ *Versi:* ${pkg.version}\n📝 *Deskripsi:* ${pkg.description}\n👤 *Author:* ${pkg.author}`; sock.sendMessage(msg.key.remoteJid, { text: infoText }, { quoted: msg }); }, category: 'owner' });
commands.set('gclone', { execute: async (sock, msg, args) => { const url = args[0]; if (!url) return sock.sendMessage(msg.key.remoteJid, { text: '❌ Masukkan link repository GitHub!' }, { quoted: msg }); const repo = await githubInfo(url); if (!repo) return sock.sendMessage(msg.key.remoteJid, { text: '❌ Repository tidak ditemukan!' }, { quoted: msg }); const infoText = `🐙 *Info Repository GitHub*\n\n📌 *Nama:* ${repo.fullName}\n📝 *Deskripsi:* ${repo.description}\n⭐ *Stars:* ${repo.stars}\n🍴 *Forks:* ${repo.forks}\n💻 *Bahasa:* ${repo.language}\n🔗 *Link:* ${repo.url}`; sock.sendMessage(msg.key.remoteJid, { text: infoText }, { quoted: msg }); }, category: 'owner' });
commands.set('apistatus', { execute: async (sock, msg) => { const apis = [{ name: 'NPM Registry', url: 'https://registry.npmjs.org/' }, { name: 'GitHub API', url: 'https://api.github.com/' }]; let statusText = '📊 *Status API Eksternal*\n\n'; const results = await Promise.allSettled(apis.map(api => axios.get(api.url, { timeout: 5000 }))); results.forEach((result, index) => { const api = apis[index]; statusText += result.status === 'fulfilled' ? `✅ ${api.name}: Online\n` : `❌ ${api.name}: Offline / Error\n`; }); sock.sendMessage(msg.key.remoteJid, { text: statusText }, { quoted: msg }); }, category: 'owner' });


// --- FUNGSI UTAMA KONEKSI DAN HANDLER ---
async function connectToWhatsApp() {
    console.log('Memulai koneksi ke WhatsApp...');
    const { state, saveCreds } = await useMultiFileAuthState('./sessions');
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({ version, logger, printQRInTerminal: false, auth: state, browser: ['Windbi Bot', 'Chrome', '4.0.0'] });

    sock.ev.on('connection.update', (update) => {
        const { qr, connection, lastDisconnect } = update;
        if (qr) { console.log('Scan QR Code ini untuk menghubungkan bot:'); qrcode.generate(qr, { small: true }); }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus, mencoba hubungkan kembali...', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ Bot berhasil terhubung!');
        }
    });
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') return;
        
        const from = msg.key.remoteJid; const isGroup = from.endsWith('@g.us'); const sender = msg.key.participant || from;
        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const args = body.trim().split(/ +/).slice(1);
        const commandText = body.trim().toLowerCase().split(' ')[0];
        
        if (!commandText.startsWith(prefix)) return;
        const commandName = commandText.replace(prefix, '');
        const command = commands.get(commandName);

        if (!command) return sock.sendMessage(from, { text: `❌ Command tidak dikenali! Ketik *${prefix}menu* untuk melihat daftar.` }, { quoted: msg });

        const isOwner = sender === ownerNumber;
        let isAdmin = false;
        if (isGroup) { try { const groupMetadata = await sock.groupMetadata(from); isAdmin = groupMetadata.participants.some(p => p.id === sender && (p.admin === 'admin' || p.admin === 'superadmin')); } catch (e) { console.error('Gagal mendapatkan metadata grup:', e); } }

        if (command.category === 'owner' && !isOwner) return sock.sendMessage(from, { text: '❌ Perintah ini hanya untuk Owner!' }, { quoted: msg });
        if (command.category === 'admin' && !isOwner && !isAdmin) return sock.sendMessage(from, { text: '❌ Perintah ini hanya untuk Admin Grup!' }, { quoted: msg });
        
        try { await command.execute(sock, msg, args); }
        catch (error) { console.error(`Error executing command ${commandName}:`, error); sock.sendMessage(from, { text: `❌ Terjadi kesalahan saat menjalankan perintah ${commandName}` }, { quoted: msg }); }
    });
    
    return sock;
}

// Jalankan koneksi
connectToWhatsApp().catch(err => console.error("Error saat memulai koneksi:", err));
import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, downloadContentFromMessage, jidDecode } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import ytdl from 'ytdl-core';
import os from 'os';
import osUtils from 'os-utils';
import sqlite from 'sqlite3';
import { readFile, writeFile, unlink } from 'fs/promises';
import archiver from 'archiver';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ownerNumber = '6285929088764@s.whatsapp.net';
const botPrefix = '.';
let selfMode = false;
const defaultImageUrl = 'https://windbiom-ai-new.vercel.app/sticker/neutral.png';

const sessionId = process.env.RAILWAY_SERVICE_NAME || 'session';
const dbPath = path.join('/tmp', 'verified_users.db');
const authPath = path.join(__dirname, 'auth_info_' + sessionId);

const tebakkataGames = new Map();
const mathQuizGames = new Map();
const tebakAngkaGames = new Map();

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

function isUserBanned(jid) {
    return new Promise((resolve, reject) => {
        const db = new sqlite.Database(dbPath);
        db.get('SELECT jid FROM banned_users WHERE jid = ?', [jid], (err, row) => {
            if (err) reject(err);
            else resolve(!!row);
        });
        db.close();
    });
}

function banUser(jid) {
    return new Promise((resolve, reject) => {
        const db = new sqlite.Database(dbPath);
        db.run('INSERT OR IGNORE INTO banned_users (jid) VALUES (?)', [jid], function(err) {
            if (err) reject(err);
            else resolve();
        });
        db.close();
    });
}

function unbanUser(jid) {
    return new Promise((resolve, reject) => {
        const db = new sqlite.Database(dbPath);
        db.run('DELETE FROM banned_users WHERE jid = ?', [jid], function(err) {
            if (err) reject(err);
            else resolve();
        });
        db.close();
    });
}

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
│ • .brattoimg <pesan>
│ • .iqc <pesan>
│ • .randommeme
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗥 ⧽━╾❐
│ • .playyt <query>
│ • .yt <url>
│ • .ig <url>
│ • .tt <url>
│ • .tostiker <reply img/vid>
│ • .tomedia <reply stiker>
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗔𝗗𝗠𝗜𝗡 ⧽━╾❐
│ • .kick <@..>
│ • .ban <@..>
│ • .unban <@..>
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

async function verifyCommand(sock, message) {
    const senderJid = message.key.remoteJid;
    if (await isUserVerified(senderJid)) {
        return sock.sendMessage(senderJid, { text: '✅ Nomor kamu sudah terverifikasi.' });
    }
    await addUserToDatabase(senderJid);
    return sock.sendMessage(senderJid, { text: '✅ Verifikasi berhasil! Selamat menggunakan bot.' });
}

async function selfCommand(sock, message) {
    selfMode = true;
    return sock.sendMessage(message.key.remoteJid, { text: '✅ Mode self diaktifkan. Hanya owner yang bisa menggunakan bot.' });
}

async function unselfCommand(sock, message) {
    selfMode = false;
    return sock.sendMessage(message.key.remoteJid, { text: '✅ Mode self dinonaktifkan. Bot bisa digunakan oleh semua orang.' });
}

async function playytCommand(sock, message, text) {
    const query = text.slice(8).trim();
    if (!query) return sock.sendMessage(message.key.remoteJid, { text: 'Masukkan judul lagu!' });
    try {
        const { data } = await axios.get(`https://api-faa.my.id/faa/ytplay?query=${encodeURIComponent(query)}`);
        
        console.log('YouTube Play API Response:', JSON.stringify(data, null, 2));

        if (!data.status || !data.result) throw new Error('API Error: Invalid response from YouTube API');

        const audioUrl = data.result.audio || data.result.audio_url || data.result.download_url;
        const title = data.result.title || 'No Title';

        if (!audioUrl) {
            throw new Error('API Error: Audio URL not found in response');
        }

        await sock.sendMessage(message.key.remoteJid, { 
            audio: { url: audioUrl }, 
            mimetype: 'audio/mpeg',
            caption: `*${title}*`
        });
    } catch (error) {
        console.error("YouTube Play Error:", error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mengunduh lagu. Pastikan judul benar atau coba lagi nanti.' });
    }
}

async function igCommand(sock, message, text) {
    const url = text.split(' ')[1];
    if (!url) return sock.sendMessage(message.key.remoteJid, { text: 'Kirim link Instagramnya!' });
    try {
        const { data } = await axios.get(`https://api-faa.my.id/faa/igdl?url=${encodeURIComponent(url)}`);
        
        console.log('Instagram API Response:', JSON.stringify(data, null, 2));

        if (!data.status || !data.result) throw new Error('API Error: Invalid response from Instagram API');

        const result = data.result;
        let caption = `*Instagram Downloader*\n\n👤 *Author:* ${result.author || 'Unknown'}\n💬 *Caption:* ${result.caption || 'No caption'}\n\n`;

        const mediaUrls = result.media_urls || result.urls || result.media;
        const singleUrl = result.url || result.video_url || result.image_url;

        if (mediaUrls && Array.isArray(mediaUrls)) {
            for (const mediaItem of mediaUrls) {
                const itemUrl = typeof mediaItem === 'string' ? mediaItem : mediaItem.url;
                const itemType = typeof mediaItem === 'object' ? mediaItem.type : (itemUrl.match(/\.(jpg|jpeg|png)$/i) ? 'image' : 'video');

                if (itemType === 'image') {
                    await sock.sendMessage(message.key.remoteJid, { image: { url: itemUrl }, caption: caption });
                    caption = '';
                } else if (itemType === 'video') {
                    await sock.sendMessage(message.key.remoteJid, { video: { url: itemUrl }, caption: caption });
                    caption = '';
                }
            }
        } else if (singleUrl) {
            const type = result.type || (singleUrl.match(/\.(jpg|jpeg|png)$/i) ? 'image' : 'video');
            if (type === 'image') {
                await sock.sendMessage(message.key.remoteJid, { image: { url: singleUrl }, caption: caption });
            } else {
                await sock.sendMessage(message.key.remoteJid, { video: { url: singleUrl }, caption: caption });
            }
        } else {
            throw new Error('API Error: No media found in response');
        }
    } catch (error) {
        console.error("Instagram Downloader Error:", error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mendownload. Pastikan link benar dan bukan akun privat.' });
    }
}

async function ttCommand(sock, message, text) {
    const url = text.split(' ')[1];
    if (!url) return sock.sendMessage(message.key.remoteJid, { text: 'Kirim link TikToknya!' });
    try {
        const { data } = await axios.get(`https://api-faa.my.id/faa/tiktok?url=${encodeURIComponent(url)}`);
        
        console.log('TikTok API Response:', JSON.stringify(data, null, 2));

        if (!data.status || !data.result) throw new Error('API Error: Invalid response from TikTok API');

        const result = data.result;
        let caption = `*TikTok Downloader*\n\n🎵 *Judul:* ${result.title || 'No title'}\n\n`;

        const videoUrl = result.video_url || result.video || result.url;
        const imageUrls = result.images || result.image_urls;

        if (videoUrl) {
            await sock.sendMessage(message.key.remoteJid, { 
                video: { url: videoUrl }, 
                caption: caption 
            });
        } else if (imageUrls && Array.isArray(imageUrls)) {
            for (const imageUrl of imageUrls) {
                await sock.sendMessage(message.key.remoteJid, { image: { url: imageUrl } });
            }
            await sock.sendMessage(message.key.remoteJid, { text: caption });
        } else {
            throw new Error('API Error: No media found in response');
        }
    } catch (error) {
        console.error("TikTok Downloader Error:", error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mendownload. Pastikan link benar.' });
    }
}

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
        await sock.sendMessage(message.key.remoteJid, { image: buffer, caption: 'Berhasil dikonversi!' }, { quoted: message });
    } catch (error) {
        console.error("Gagal mengkonversi stiker:", error);
        await sock.sendMessage(message.key.remoteJid, { image: { url: defaultImageUrl }, caption: 'Gagal mengkonversi, coba stiker lain.' }, { quoted: message });
    }
}

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

function cekFun(sock, message, text, type) {
    const mentions = parseMention(text);
    if (mentions.length === 0) return sock.sendMessage(message.key.remoteJid, { text: `Tag orang yang ingin dicek ${type}!` });
    const target = mentions[0];
    const percentage = Math.floor(Math.random() * 101);
    sock.sendMessage(message.key.remoteJid, { text: `Orang itu ${type}: ${percentage}%`, mentions: [target] }, { quoted: message });
}

async function brattoimgCommand(sock, message, text) {
    const pesan = text.slice(11).trim();
    if (!pesan) return sock.sendMessage(message.key.remoteJid, { text: 'Masukkan pesan yang ingin diubah menjadi gambar!' });
    try {
        const { data } = await axios.get(`https://api-faa.my.id/faa/brat?text=${encodeURIComponent(pesan)}`, {
            responseType: 'arraybuffer'
        });
        const buffer = Buffer.from(data, 'binary');
        await sock.sendMessage(message.key.remoteJid, { image: buffer, caption: `Brat: "${pesan}"` }, { quoted: message });
    } catch (error) {
        console.error(error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal membuat gambar.' });
    }
}

async function iqcCommand(sock, message, text) {
    const pesan = text.slice(5).trim();
    if (!pesan) return sock.sendMessage(message.key.remoteJid, { text: 'Masukkan pesan yang ingin diubah menjadi gambar!' });
    try {
        const { data } = await axios.get(`https://api-faa.my.id/faa/iqc?text=${encodeURIComponent(pesan)}`, {
            responseType: 'arraybuffer'
        });
        const buffer = Buffer.from(data, 'binary');
        await sock.sendMessage(message.key.remoteJid, { image: buffer, caption: `IQ: "${pesan}"` }, { quoted: message });
    } catch (error) {
        console.error(error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal membuat gambar.' });
    }
}

async function randommemeCommand(sock, message) {
    try {
        const { data } = await axios.get('https://api-faa.my.id/faa/meme');
        if (!data.status || !data.result) throw new Error('API Error');
        
        await sock.sendMessage(message.key.remoteJid, { 
            image: { url: data.result.url },
            caption: `*Random Meme*\n\n📝 *Title:* ${data.result.title}\n`
        });
    } catch (error) {
        console.error(error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mengambil meme.' });
    }
}

async function gigCommand(sock, message, senderJid) {
    const isGroup = message.key.remoteJid.endsWith('@g.us');
    if (!isGroup) return sock.sendMessage(senderJid, { text: 'Fitur ini hanya untuk grup!' });
    
    try {
        const groupMetadata = await sock.groupMetadata(message.key.remoteJid);
        const groupAdmins = groupMetadata.participants.filter(p => p.admin).map(p => p.id);
        const totalMembers = groupMetadata.participants.length;
        
        const groupInfo = `*Group Information*\n\n📝 *Name:* ${groupMetadata.subject}\n👥 *Total Members:* ${totalMembers}\n👑 *Admins:* ${groupAdmins.length}\n📅 *Created:* ${groupMetadata.creation ? new Date(groupMetadata.creation * 1000).toLocaleString('id-ID') : 'Unknown'}\n\n*Admin List:*\n${groupAdmins.map(admin => `• @${admin.split('@')[0]}`).join('\n')}`;
        
        await sock.sendMessage(message.key.remoteJid, { 
            text: groupInfo,
            mentions: groupAdmins
        }, { quoted: message });
    } catch (error) {
        console.error(error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mengambil informasi grup.' });
    }
}

async function linkCommand(sock, message, senderJid) {
    const isGroup = message.key.remoteJid.endsWith('@g.us');
    if (!isGroup) return sock.sendMessage(senderJid, { text: 'Fitur ini hanya untuk grup!' });
    
    try {
        const groupMetadata = await sock.groupMetadata(message.key.remoteJid);
        const isAdmin = groupMetadata.participants.find(p => p.id === senderJid)?.admin;
        
        if (!isAdmin && !senderJid.includes(ownerNumber.replace('@s.whatsapp.net', ''))) {
            return sock.sendMessage(senderJid, { text: 'Fitur ini hanya untuk admin grup!' });
        }
        
        const inviteCode = await sock.groupInviteCode(message.key.remoteJid);
        const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
        
        await sock.sendMessage(message.key.remoteJid, { 
            text: `*Group Invite Link*\n\n🔗 *Link:* ${inviteLink}\n\n*Note:* Jangan bagikan link ini kepada orang yang tidak diinginkan!`
        }, { quoted: message });
    } catch (error) {
        console.error(error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mengambil link grup. Pastikan bot admin.' });
    }
}

async function tebakkataCommand(sock, message, senderJid) {
    if (tebakkataGames.has(senderJid)) {
        return sock.sendMessage(senderJid, { text: 'Kamu sudah dalam game tebakkata! Selesaikan dulu atau ketik .nyerah untuk menyerah.' });
    }
    try {
        const { data } = await axios.get('https://api-faa.my.id/faa/katabacakata');
        if (!data.status || !data.result) throw new Error('API Error');
        
        const { soal, jawaban } = data.result;
        const gameMessage = await sock.sendMessage(senderJid, { text: `🎮 *Tebak Kata*\n\nSoal: ${soal}\n\n*Reply pesan ini untuk menjawab!*` });
        tebakkataGames.set(senderJid, { jawaban: jawaban.toLowerCase(), messageId: gameMessage.key.id });
        
    } catch (error) {
        console.error(error);
        return sock.sendMessage(senderJid, { text: '❌ Gagal memulai game.' });
    }
}

async function mathquizCommand(sock, message, senderJid) {
    if (mathQuizGames.has(senderJid)) {
        return sock.sendMessage(senderJid, { text: 'Kamu sudah dalam game math quiz! Selesaikan dulu.' });
    }
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

    const gameMessage = await sock.sendMessage(senderJid, { text: `🧮 *Math Quiz*\n\nBerapa hasil dari ${num1} ${operator} ${num2}?\n\n*Reply pesan ini untuk menjawab!*` });
    mathQuizGames.set(senderJid, { question: `${num1} ${operator} ${num2}`, answer: answer.toString(), messageId: gameMessage.key.id });
}

async function tebakangkaCommand(sock, message, senderJid) {
    if (tebakAngkaGames.has(senderJid)) {
        return sock.sendMessage(senderJid, { text: 'Kamu sudah dalam game tebak angka! Selesaikan dulu.' });
    }
    const randomNumber = Math.floor(Math.random() * 100) + 1;
    const gameMessage = await sock.sendMessage(senderJid, { text: `🔢 *Tebak Angka*\n\nAku telah memilih angka antara 1-100. Coba tebak!\n\n*Reply pesan ini untuk menjawab!*` });
    tebakAngkaGames.set(senderJid, { number: randomNumber, messageId: gameMessage.key.id });
}

async function kickCommand(sock, message, text, senderJid) {
    const isGroup = message.key.remoteJid.endsWith('@g.us');
    if (!isGroup) return sock.sendMessage(senderJid, { text: 'Fitur ini hanya untuk grup!' });

    const groupMetadata = await sock.groupMetadata(message.key.remoteJid);
    const isAdmin = groupMetadata.participants.find(p => p.id === senderJid)?.admin;
    const isBotAdmin = groupMetadata.participants.find(p => p.id === sock.user.id)?.admin;

    if (!isAdmin && !senderJid.includes(ownerNumber.replace('@s.whatsapp.net', ''))) {
        return sock.sendMessage(senderJid, { text: 'Fitur ini hanya untuk admin!' });
    }
    if (!isBotAdmin) {
        return sock.sendMessage(senderJid, { text: 'Bot harus menjadi admin untuk menggunakan fitur ini!' });
    }

    const usersToKick = parseMention(text);
    if (usersToKick.length === 0) {
        return sock.sendMessage(senderJid, { text: 'Tag member yang ingin dikeluarkan!' });
    }

    await sock.groupParticipantsUpdate(message.key.remoteJid, usersToKick, 'remove');
    await sock.sendMessage(senderJid, { text: `✅ Berhasil mengeluarkan ${usersToKick.length} member.` });
}

async function banCommand(sock, message, text, senderJid) {
    if (senderJid !== ownerNumber) return sock.sendMessage(senderJid, { text: 'Fitur ini hanya untuk owner!' });
    const usersToBan = parseMention(text);
    if (usersToBan.length === 0) return sock.sendMessage(senderJid, { text: 'Tag user yang ingin dibanned!' });
    
    for (const user of usersToBan) {
        await banUser(user);
    }
    await sock.sendMessage(senderJid, { text: `✅ Berhasil membanned ${usersToBan.length} user.` });
}

async function unbanCommand(sock, message, text, senderJid) {
    if (senderJid !== ownerNumber) return sock.sendMessage(senderJid, { text: 'Fitur ini hanya untuk owner!' });
    const usersToUnban = parseMention(text);
    if (usersToUnban.length === 0) return sock.sendMessage(senderJid, { text: 'Tag user yang ingin di-unbanned!' });
    
    for (const user of usersToUnban) {
        await unbanUser(user);
    }
    await sock.sendMessage(senderJid, { text: `✅ Berhasil meng-unbanned ${usersToUnban.length} user.` });
}

async function gcloneCommand(sock, message, text, senderJid) {
    if (senderJid !== ownerNumber) return sock.sendMessage(senderJid, { text: 'Fitur ini hanya untuk owner!' });
    const repoUrl = text.split(' ')[1];
    if (!repoUrl) return sock.sendMessage(senderJid, { text: 'Masukkan link repository GitHub!' });
    
    const repoName = repoUrl.split('/').pop().replace('.git', '');
    const tempDir = path.join('/tmp', repoName);
    const zipPath = path.join('/tmp', `${repoName}.zip`);

    try {
        await sock.sendMessage(senderJid, { text: `🔄 Mulai meng-clone ${repoName}...` });
        
        await execAsync(`git clone ${repoUrl} ${tempDir}`);
        await sock.sendMessage(senderJid, { text: `✅ Berhasil meng-clone. Mulai mengompres...` });

        const archive = archiver('zip', { zlib: { level: 9 } });
        const output = writeFile(zipPath, '');
        archive.pipe(output);
        archive.directory(tempDir, false);
        await archive.finalize();

        await sock.sendMessage(senderJid, { text: `✅ Berhasil mengompres. Mengirim file...` });
        
        await sock.sendMessage(senderJid, { document: { url: zipPath }, fileName: `${repoName}.zip`, mimetype: 'application/zip' });

        await execAsync(`rm -rf ${tempDir} ${zipPath}`);

    } catch (error) {
        console.error(error);
        await sock.sendMessage(senderJid, { text: '❌ Gagal meng-clone repository. Pastikan link valid dan publik.' });
    }
}

async function apistatusCommand(sock, message, senderJid) {
    if (senderJid !== ownerNumber) return sock.sendMessage(senderJid, { text: 'Fitur ini hanya untuk owner!' });
    const apis = [
        { name: 'YouTube Play', url: 'https://api-faa.my.id/faa/ytplay?query=test' },
        { name: 'Instagram DL', url: 'https://api-faa.my.id/faa/igdl?url=https://instagram.com' },
        { name: 'TikTok DL', url: 'https://api-faa.my.id/faa/tiktok?url=https://tiktok.com' },
        { name: 'Meme', url: 'https://api-faa.my.id/faa/meme' },
    ];

    let statusText = `*📊 API Status Check*\n\n`;
    for (const api of apis) {
        try {
            const startTime = Date.now();
            await axios.get(api.url, { timeout: 5000 });
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            statusText += `✅ *${api.name}*: Online (${responseTime}ms)\n`;
        } catch (error) {
            statusText += `❌ *${api.name}*: Offline\n`;
        }
    }
    await sock.sendMessage(senderJid, { text: statusText });
}

async function logCommand(sock, message, senderJid) {
    if (senderJid !== ownerNumber) return sock.sendMessage(senderJid, { text: 'Fitur ini hanya untuk owner!' });
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

    const logText = `*📄 Bot System Log*\n\n` +
        `⏳ *Uptime*: ${statusUptime}\n` +
        `🖥️ *CPU Usage*: ${cpuUsage.toFixed(2)}%\n` +
        `💾 *RAM Usage*: ${ramUsage}% (${(usedMem / 1024).toFixed(2)}MB / ${(totalMem / 1024).toFixed(2)}MB)\n` +
        `📱 *Platform*: ${os.type()} ${os.release()}\n` +
        `🔗 *Total Games*: ${tebakkataGames.size + mathQuizGames.size + tebakAngkaGames.size}`;
    
    await sock.sendMessage(senderJid, { text: logText });
}

async function startBot() {
    console.log('Memulai bot WhatsApp...');

    const db = new sqlite.Database(dbPath);
    db.run('CREATE TABLE IF NOT EXISTS verified_users (jid TEXT PRIMARY KEY)', (err) => {
        if (err) console.error('Gagal membuat tabel verified_users:', err.message);
    });
    db.run('CREATE TABLE IF NOT EXISTS banned_users (jid TEXT PRIMARY KEY)', (err) => {
        if (err) console.error('Gagal membuat tabel banned_users:', err.message);
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

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message) return;
        if (msg.message.protocolMessage) return;
        if (msg.key.fromMe) return;

        const senderJid = msg.key.remoteJid;
        const messageText = extractMessageText(msg);
        const command = messageText.toLowerCase().trim().split(/ +/)[0];

        if (await isUserBanned(senderJid)) {
            return;
        }

        if (command !== '.verify' && !(await isUserVerified(senderJid))) {
            return sock.sendMessage(senderJid, { text: '❌ Kamu belum terverifikasi. Ketik *.verify* untuk menggunakan bot.' });
        }

        if (selfMode && senderJid !== ownerNumber) {
            return;
        }

        const isReply = msg.message.extendedTextMessage;
        const quotedMessageId = isReply ? msg.message.extendedTextMessage.contextInfo.stanzaId : null;
        const replyText = isReply ? msg.message.extendedTextMessage.text : '';

        if (tebakkataGames.has(senderJid)) {
            const game = tebakkataGames.get(senderJid);
            if (isReply && quotedMessageId === game.messageId) {
                if (replyText.toLowerCase() === game.jawaban) {
                    await sock.sendMessage(senderJid, { text: `🎉 Benar! Jawabannya adalah *${game.jawaban}*`, mentions: [senderJid] }, { quoted: msg });
                    tebakkataGames.delete(senderJid);
                } else {
                    await sock.sendMessage(senderJid, { text: `❌ Salah! Coba lagi.` }, { quoted: msg });
                }
            } else if (messageText.toLowerCase() === '.nyerah') {
                await sock.sendMessage(senderJid, { text: `😔 Yah menyerah! Jawabannya adalah *${game.jawaban}*` });
                tebakkataGames.delete(senderJid);
            }
            return;
        }

        if (mathQuizGames.has(senderJid)) {
            const game = mathQuizGames.get(senderJid);
            if (isReply && quotedMessageId === game.messageId) {
                if (replyText === game.answer) {
                    await sock.sendMessage(senderJid, { text: `🎉 Benar! Jawaban dari *${game.question}* adalah *${game.answer}*`, mentions: [senderJid] }, { quoted: msg });
                    mathQuizGames.delete(senderJid);
                } else {
                    await sock.sendMessage(senderJid, { text: `❌ Salah! Coba lagi.` }, { quoted: msg });
                }
            }
            return;
        }

        if (tebakAngkaGames.has(senderJid)) {
            const game = tebakAngkaGames.get(senderJid);
            if (isReply && quotedMessageId === game.messageId) {
                const guess = parseInt(replyText);
                if (!isNaN(guess)) {
                    if (guess === game.number) {
                        await sock.sendMessage(senderJid, { text: `🎉 Tebakanmu benar! Angkanya adalah *${game.number}*`, mentions: [senderJid] }, { quoted: msg });
                        tebakAngkaGames.delete(senderJid);
                    } else if (guess < game.number) {
                        await sock.sendMessage(senderJid, { text: `📉 Terlalu rendah! Coba lagi.` }, { quoted: msg });
                    } else if (guess > game.number) {
                        await sock.sendMessage(senderJid, { text: `📈 Terlalu tinggi! Coba lagi.` }, { quoted: msg });
                    }
                } else {
                    await sock.sendMessage(senderJid, { text: `❌ Masukkan angka yang valid!` }, { quoted: msg });
                }
            }
            return;
        }

        if (!messageText.startsWith(botPrefix)) return;

        console.log(`\n--- Pesan Masuk ---`);
        console.log(`Dari: ${senderJid}`);
        console.log(`Command: ${command}`);
        console.log(`--------------------\n`);

        try {
            switch (command) {
                case '.menu': case '.help': await showMenu(sock, msg); break;
                case '.verify': await verifyCommand(sock, msg); break;
                case '.self': if (senderJid === ownerNumber) await selfCommand(sock, msg); break;
                case '.unself': if (senderJid === ownerNumber) await unselfCommand(sock, msg); break;
                case '.playyt': await playytCommand(sock, msg, messageText); break;
                case '.ig': await igCommand(sock, msg, messageText); break;
                case '.tt': await ttCommand(sock, msg, messageText); break;
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
                case '.brattoimg': await brattoimgCommand(sock, msg, messageText); break;
                case '.iqc': await iqcCommand(sock, msg, messageText); break;
                case '.randommeme': await randommemeCommand(sock, msg); break;
                case '.gig': await gigCommand(sock, msg, senderJid); break;
                case '.link': await linkCommand(sock, msg, senderJid); break;
                case '.tebakkata': await tebakkataCommand(sock, msg, senderJid); break;
                case '.mathquiz': await mathquizCommand(sock, msg, senderJid); break;
                case '.tebakangka': await tebakangkaCommand(sock, msg, senderJid); break;
                case '.kick': await kickCommand(sock, msg, messageText, senderJid); break;
                case '.ban': await banCommand(sock, msg, messageText, senderJid); break;
                case '.unban': await unbanCommand(sock, msg, messageText, senderJid); break;
                case '.gclone': await gcloneCommand(sock, msg, messageText, senderJid); break;
                case '.apistatus': await apistatusCommand(sock, msg, senderJid); break;
                case '.log': await logCommand(sock, msg, senderJid); break;
                case '.ping': await sock.sendMessage(senderJid, { text: 'Pong!' }); break;
                default: await sock.sendMessage(senderJid, { text: `Command "${command}" tidak ditemukan. Ketik .menu` }); break;
            }
        } catch (error) {
            console.error(`❌ Error saat menjalankan command ${command}:`, error);
            await sock.sendMessage(senderJid, { text: 'Maaf, terjadi kesalahan pada bot.' });
        }
    });
}

startBot().catch(err => {
    console.error("Gagal menjalankan bot:", err);
});
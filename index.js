import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, downloadContentFromMessage, generateWAMessageFromContent, proto } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import ytdl from 'ytdl-core';
import os from 'os';
import osUtils from 'os-utils';
import sqlite3 from 'sqlite3';
import { readFile, writeFile, unlink, existsSync, mkdirSync } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

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
const tbkkataPath = path.join(__dirname, 'tbkkata.json'); // Path untuk tebak kata
// -------------------------

// --- FUNGSI DATABASE ---
function initDatabase() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        db.run(`
            CREATE TABLE IF NOT EXISTS verified_users (
                jid TEXT PRIMARY KEY,
                verified_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) reject(err);
            else resolve();
        });
        db.close();
    });
}

function isUserVerified(jid) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        db.get('SELECT jid FROM verified_users WHERE jid = ?', [jid], (err, row) => {
            if (err) reject(err);
            else resolve(!!row);
        });
        db.close();
    });
}

function addUserToDatabase(jid) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
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
    if (!msg.message) return '';
    const msgType = Object.keys(msg.message)[0];
    if (msgType === 'conversation') return msg.message.conversation;
    if (msgType === 'extendedTextMessage') return msg.message.extendedTextMessage.text;
    if (msgType === 'imageMessage') return msg.message.imageMessage.caption || '';
    if (msgType === 'videoMessage') return msg.message.videoMessage.caption || '';
    if (msgType === 'stickerMessage') return '';
    return '';
}

function parseMention(text) {
    return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(v => v[1] + '@s.whatsapp.net');
}

async function downloadMedia(message, type) {
    try {
        const stream = await downloadContentFromMessage(message.message[type], type.replace('Message', ''));
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        return buffer;
    } catch (error) {
        console.error("Gagal mendownload media:", error);
        throw error;
    }
}

async function checkFfmpeg() {
    try {
        await execAsync('ffmpeg -version');
        return true;
    } catch {
        console.warn('FFmpeg tidak terinstall, beberapa fitur mungkin tidak berfungsi');
        return false;
    }
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
│ • .stiker <reply> <watermark>
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

// 3. Self / Unself (Hanya owner)
async function selfCommand(sock, message) {
    const senderJid = message.key.remoteJid;
    if (senderJid !== ownerNumber) {
        return sock.sendMessage(senderJid, { text: '❌ Hanya owner yang bisa menggunakan command ini!' });
    }
    selfMode = true;
    return sock.sendMessage(senderJid, { text: '✅ Mode self diaktifkan. Hanya owner yang bisa menggunakan bot.' });
}

async function unselfCommand(sock, message) {
    const senderJid = message.key.remoteJid;
    if (senderJid !== ownerNumber) {
        return sock.sendMessage(senderJid, { text: '❌ Hanya owner yang bisa menggunakan command ini!' });
    }
    selfMode = false;
    return sock.sendMessage(senderJid, { text: '✅ Mode self dinonaktifkan. Semua user bisa menggunakan bot.' });
}

// 4. TikTok Downloader
async function tosCommand(sock, message, text) {
    const url = text.split(' ')[1];
    if (!url) return sock.sendMessage(message.key.remoteJid, { text: 'Kirim link TikToknya! Contoh: .tos https://tiktok.com/...' });
    try {
        const { result } = await import('@tobyg74/tiktok-api-dl');
        const data = await result(url);
        let resultText = `*TikTok Downloader*\n\n🎵 *Judul:* ${data.title}\n\n`;
        if (data.type === 'video') {
            await sock.sendMessage(message.key.remoteJid, { 
                video: { url: data.video[0] }, 
                caption: resultText,
                mimetype: 'video/mp4'
            });
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

// 5. Instagram Downloader (FIXED dengan library lain)
async function igCommand(sock, message, text) {
    const url = text.split(' ')[1];
    if (!url) return sock.sendMessage(message.key.remoteJid, { text: 'Kirim link Instagramnya! Contoh: .ig https://instagram.com/...' });
    try {
        // Menggunakan instagram-url-direct
        const { getInstagramMedia } = await import('instagram-url-direct');
        const links = await getInstagramMedia(url);
        
        if (links && links.url_list && links.url_list.length > 0) {
            for (const mediaUrl of links.url_list) {
                if (mediaUrl.endsWith('.mp4')) {
                    await sock.sendMessage(message.key.remoteJid, { 
                        video: { url: mediaUrl },
                        caption: `*Instagram Downloader*\n\n📥 Berhasil mendownload media`
                    });
                } else {
                    await sock.sendMessage(message.key.remoteJid, { 
                        image: { url: mediaUrl },
                        caption: `*Instagram Downloader*\n\n📥 Berhasil mendownload media`
                    });
                }
            }
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
    if (!query) return sock.sendMessage(message.key.remoteJid, { text: 'Masukkan judul lagu! Contoh: .playyt lagu terbaru' });
    try {
        const searchResults = await ytdl.search(query, { limit: 1 });
        if (searchResults.length === 0) throw new Error('Lagu tidak ditemukan');
        const video = searchResults[0];
        const info = await ytdl.getInfo(video.videoDetails.video_url);
        const audioFormat = ytdl.chooseFormat(info.formats, { quality: '140' });
        
        await sock.sendMessage(message.key.remoteJid, { 
            text: `*YouTube Downloader*\n\n🎵 *Judul:* ${video.title}\n📊 *Durasi:* ${video.duration}\n⏬ *Mendownload...*`
        });
        
        await sock.sendMessage(message.key.remoteJid, {
            audio: { url: audioFormat.url },
            mimetype: 'audio/mpeg',
            fileName: `${video.title.replace(/[^a-z0-9]/gi, '_')}.mp3`
        });
    } catch (error) {
        console.error(error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mengunduh lagu. Pastikan link valid.' });
    }
}

// 7. YouTube Video Downloader
async function ytCommand(sock, message, text) {
    const url = text.split(' ')[1];
    if (!url) return sock.sendMessage(message.key.remoteJid, { text: 'Kirim link YouTube! Contoh: .yt https://youtube.com/...' });
    try {
        const info = await ytdl.getInfo(url);
        const format = ytdl.chooseFormat(info.formats, { quality: '360' });
        
        await sock.sendMessage(message.key.remoteJid, { 
            text: `*YouTube Video Downloader*\n\n📺 *Judul:* ${info.videoDetails.title}\n⏱️ *Durasi:* ${info.videoDetails.lengthSeconds} detik\n⏬ *Mendownload...*`
        });
        
        await sock.sendMessage(message.key.remoteJid, {
            video: { url: format.url },
            caption: info.videoDetails.title,
            mimetype: 'video/mp4'
        });
    } catch (error) {
        console.error(error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mengunduh video. Pastikan link valid.' });
    }
}

// 8. To Stiker (Image/Video to Sticker) dengan FFMPEG
async function tostikerCommand(sock, message, text) {
    const msgType = Object.keys(message.message)[0];
    if (!['imageMessage', 'videoMessage'].includes(msgType)) {
        return sock.sendMessage(message.key.remoteJid, { text: 'Reply gambar/video dengan caption .tostiker' });
    }
    
    const hasFfmpeg = await checkFfmpeg();
    if (!hasFfmpeg) {
        return sock.sendMessage(message.key.remoteJid, { text: '❌ FFmpeg tidak terinstall. Stiker tidak bisa dibuat.' });
    }
    
    try {
        const buffer = await downloadMedia(message, msgType);
        const tempInput = path.join('/tmp', `input_${Date.now()}.${msgType === 'imageMessage' ? 'jpg' : 'mp4'}`);
        const tempOutput = path.join('/tmp', `output_${Date.now()}.webp`);
        
        await writeFile(tempInput, buffer);
        
        if (msgType === 'imageMessage') {
            // Convert image to webp
            await execAsync(`ffmpeg -i "${tempInput}" -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2" -c:v libwebp -lossless 0 -qscale 75 -preset default -loop 0 -an -vsync 0 "${tempOutput}"`);
        } else {
            // Convert video to animated webp
            await execAsync(`ffmpeg -i "${tempInput}" -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2" -c:v libwebp -lossless 0 -qscale 75 -preset default -loop 0 -an -vsync 0 -t 10 "${tempOutput}"`);
        }
        
        const stickerBuffer = await readFile(tempOutput);
        await sock.sendMessage(message.key.remoteJid, { sticker: stickerBuffer }, { quoted: message });
        
        // Cleanup
        await unlink(tempInput);
        await unlink(tempOutput);
    } catch (error) {
        console.error("Gagal membuat stiker:", error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal membuat stiker.' });
    }
}

// 9. Stiker dengan watermark
async function stikerCommand(sock, message, text) {
    const msgType = Object.keys(message.message)[0];
    if (!['imageMessage', 'videoMessage'].includes(msgType)) {
        return sock.sendMessage(message.key.remoteJid, { text: 'Reply gambar/video dengan caption .stiker <watermark>' });
    }
    
    const watermark = text.split(' ').slice(1).join(' ') || 'by Windbi Bot';
    const hasFfmpeg = await checkFfmpeg();
    if (!hasFfmpeg) {
        return sock.sendMessage(message.key.remoteJid, { text: '❌ FFmpeg tidak terinstall. Stiker tidak bisa dibuat.' });
    }
    
    try {
        const buffer = await downloadMedia(message, msgType);
        const tempInput = path.join('/tmp', `input_${Date.now()}.${msgType === 'imageMessage' ? 'jpg' : 'mp4'}`);
        const tempOutput = path.join('/tmp', `output_${Date.now()}.webp`);
        
        await writeFile(tempInput, buffer);
        
        if (msgType === 'imageMessage') {
            // Convert image to webp with watermark
            await execAsync(`ffmpeg -i "${tempInput}" -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2,drawtext=text='${watermark}':fontcolor=white:fontsize=12:x=10:y=h-text_h-10" -c:v libwebp -lossless 0 -qscale 75 -preset default -loop 0 -an -vsync 0 "${tempOutput}"`);
        } else {
            // Convert video to animated webp with watermark
            await execAsync(`ffmpeg -i "${tempInput}" -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2,drawtext=text='${watermark}':fontcolor=white:fontsize=12:x=10:y=h-text_h-10" -c:v libwebp -lossless 0 -qscale 75 -preset default -loop 0 -an -vsync 0 -t 10 "${tempOutput}"`);
        }
        
        const stickerBuffer = await readFile(tempOutput);
        await sock.sendMessage(message.key.remoteJid, { sticker: stickerBuffer }, { quoted: message });
        
        // Cleanup
        await unlink(tempInput);
        await unlink(tempOutput);
    } catch (error) {
        console.error("Gagal membuat stiker:", error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal membuat stiker.' });
    }
}

// 10. To Media (Sticker to Image/Video)
async function tomediaCommand(sock, message) {
    const msgType = Object.keys(message.message)[0];
    if (msgType !== 'stickerMessage') {
        return sock.sendMessage(message.key.remoteJid, { text: 'Reply stiker dengan caption .tomedia' });
    }
    
    try {
        const buffer = await downloadMedia(message, 'stickerMessage');
        
        // Check if sticker is animated (webp)
        const tempFile = path.join('/tmp', `sticker_${Date.now()}.webp`);
        await writeFile(tempFile, buffer);
        
        // Check file type
        const isAnimated = await execAsync(`ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${tempFile}"`).then(res => res.stdout.trim() === 'webp');
        
        if (isAnimated) {
            // Convert to video (mp4)
            const tempOutput = path.join('/tmp', `video_${Date.now()}.mp4`);
            await execAsync(`ffmpeg -i "${tempFile}" -c:v libx264 -pix_fmt yuv420p "${tempOutput}"`);
            const videoBuffer = await readFile(tempOutput);
            await sock.sendMessage(message.key.remoteJid, { video: videoBuffer, mimetype: 'video/mp4' }, { quoted: message });
            await unlink(tempOutput);
        } else {
            // Convert to image (jpg)
            const tempOutput = path.join('/tmp', `image_${Date.now()}.jpg`);
            await execAsync(`ffmpeg -i "${tempFile}" "${tempOutput}"`);
            const imageBuffer = await readFile(tempOutput);
            await sock.sendMessage(message.key.remoteJid, { image: imageBuffer }, { quoted: message });
            await unlink(tempOutput);
        }
        
        await unlink(tempFile);
    } catch (error) {
        console.error("Gagal mengkonversi stiker:", error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mengkonversi stiker ke media.' });
    }
}

// 11. Group Info (GIG)
async function gigCommand(sock, message) {
    const isGroup = message.key.remoteJid.endsWith('@g.us');
    if (!isGroup) return sock.sendMessage(message.key.remoteJid, { text: 'Fitur ini hanya untuk grup!' });
    
    try {
        const groupMetadata = await sock.groupMetadata(message.key.remoteJid);
        const participants = groupMetadata.participants;
        const adminCount = participants.filter(p => p.admin).length;
        
        const groupInfo = `
*Group Info*
📛 *Nama:* ${groupMetadata.subject}
👥 *Anggota:* ${participants.length} orang
👑 *Admin:* ${adminCount} orang
🔒 *Status:* ${groupMetadata.restrict ? 'Terkunci' : 'Terbuka'}
📅 *Dibuat:* ${new Date(groupMetadata.creation * 1000).toLocaleDateString()}
🆔 *ID Grup:* ${groupMetadata.id}
        `;
        
        await sock.sendMessage(message.key.remoteJid, { text: groupInfo });
    } catch (error) {
        console.error(error);
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mengambil info grup.' });
    }
}

// 12. Group Open/Close (Admin/Owner only)
async function grupCommand(sock, message, text) {
    const isGroup = message.key.remoteJid.endsWith('@g.us');
    if (!isGroup) return sock.sendMessage(message.key.remoteJid, { text: 'Fitur ini hanya untuk grup!' });
    
    const senderJid = message.key.remoteJid;
    const action = text.split(' ')[1]?.toLowerCase();
    
    // Cek apakah sender adalah owner
    if (senderJid !== ownerNumber) {
        return sock.sendMessage(senderJid, { text: '❌ Hanya owner yang bisa menggunakan command ini!' });
    }
    
    if (!action) {
        return sock.sendMessage(senderJid, { text: 'Pilih *buka* atau *tutup*. Contoh: .grup buka' });
    }

    try {
        const groupMetadata = await sock.groupMetadata(message.key.remoteJid);
        const isBotAdmin = groupMetadata.participants.find(p => p.id === sock.user.id)?.admin;

        if (!isBotAdmin) {
            return sock.sendMessage(senderJid, { text: '❌ Bot harus menjadi admin untuk menggunakan fitur ini!' });
        }

        if (action === 'buka') {
            await sock.groupSettingUpdate(message.key.remoteJid, 'not_announcement');
            await sock.sendMessage(senderJid, { text: '✅ Grup telah dibuka.' });
        } else if (action === 'tutup') {
            await sock.groupSettingUpdate(message.key.remoteJid, 'announcement');
            await sock.sendMessage(senderJid, { text: '✅ Grup telah ditutup.' });
        } else {
            await sock.sendMessage(senderJid, { text: '❌ Pilih *buka* atau *tutup*.' });
        }
    } catch (error) {
        console.error(error);
        await sock.sendMessage(senderJid, { text: '❌ Gagal mengubah pengaturan grup.' });
    }
}

// 13. Tag All (Totag - Admin/Owner only)
async function totagCommand(sock, message, text) {
    const isGroup = message.key.remoteJid.endsWith('@g.us');
    if (!isGroup) return sock.sendMessage(message.key.remoteJid, { text: 'Fitur ini hanya untuk grup!' });
    
    const senderJid = message.key.remoteJid;
    
    // Cek apakah sender adalah owner
    if (senderJid !== ownerNumber) {
        return sock.sendMessage(senderJid, { text: '❌ Hanya owner yang bisa menggunakan command ini!' });
    }
    
    try {
        const groupMetadata = await sock.groupMetadata(message.key.remoteJid);
        const participants = groupMetadata.participants.map(p => p.id);
        const msgToTag = text.slice(7).trim() || 'Pesan dari admin';

        await sock.sendMessage(message.key.remoteJid, { 
            text: `${msgToTag}\n\n${participants.map(p => `@${p.split('@')[0]}`).join(' ')}`, 
            mentions: participants 
        });
    } catch (error) {
        console.error(error);
        await sock.sendMessage(senderJid, { text: '❌ Gagal melakukan tag all.' });
    }
}

// 14. Kick/Ban (Owner only)
async function kickCommand(sock, message, text) {
    const isGroup = message.key.remoteJid.endsWith('@g.us');
    if (!isGroup) return sock.sendMessage(message.key.remoteJid, { text: 'Fitur ini hanya untuk grup!' });
    
    const senderJid = message.key.remoteJid;
    
    // Cek apakah sender adalah owner
    if (senderJid !== ownerNumber) {
        return sock.sendMessage(senderJid, { text: '❌ Hanya owner yang bisa menggunakan command ini!' });
    }
    
    const mentions = parseMention(text);
    if (mentions.length === 0) return sock.sendMessage(senderJid, { text: 'Tag orang yang ingin di-kick!' });
    
    try {
        const target = mentions[0];
        await sock.groupParticipantsUpdate(message.key.remoteJid, [target], 'remove');
        await sock.sendMessage(senderJid, { text: `✅ Berhasil mengeluarkan @${target.split('@')[0]}` });
    } catch (error) {
        console.error(error);
        await sock.sendMessage(senderJid, { text: '❌ Gagal mengeluarkan member.' });
    }
}

async function banCommand(sock, message, text) {
    // Same as kick for now
    return kickCommand(sock, message, text);
}

// 15. GitHub Info
async function githubCommand(sock, message, text) {
    const username = text.split(' ')[1];
    if (!username) return sock.sendMessage(message.key.remoteJid, { text: 'Masukkan username GitHub. Contoh: .github humpreydev' });
    try {
        const { data } = await axios.get(`https://api.github.com/users/${username}`);
        const resultText = `*GitHub Profile*\n\n👤 *Username:* ${data.login}\n📝 *Name:* ${data.name || 'No name'}\n📊 *Public Repos:* ${data.public_repos}\n👥 *Followers:* ${data.followers}\n🔗 *Profile:* ${data.html_url}\n📍 *Location:* ${data.location || 'Not specified'}\n🏢 *Company:* ${data.company || 'Not specified'}`;
        await sock.sendMessage(message.key.remoteJid, { text: resultText });
    } catch (error) {
        await sock.sendMessage(message.key.remoteJid, { text: '❌ User tidak ditemukan.' });
    }
}

// 16. NPM Info (Owner only)
async function npmCommand(sock, message, text) {
    const senderJid = message.key.remoteJid;
    if (senderJid !== ownerNumber) {
        return sock.sendMessage(senderJid, { text: '❌ Hanya owner yang bisa menggunakan command ini!' });
    }
    
    const packageName = text.split(' ')[1];
    if (!packageName) return sock.sendMessage(senderJid, { text: 'Masukkan nama package. Contoh: .npm axios' });
    try {
        const { data } = await axios.get(`https://registry.npmjs.org/${packageName}`);
        const latestVersion = data['dist-tags'].latest;
        const description = data.versions[latestVersion].description || 'Tidak ada deskripsi.';
        const resultText = `*NPM Package Info*\n\n📦 *Name:* ${packageName}\n🔖 *Version:* ${latestVersion}\n📄 *Description:* ${description}\n👤 *Author:* ${data.versions[latestVersion].author?.name || 'Unknown'}\n📅 *Last Published:* ${new Date(data.time[latestVersion]).toLocaleDateString()}`;
        await sock.sendMessage(senderJid, { text: resultText });
    } catch (error) {
        await sock.sendMessage(senderJid, { text: '❌ Package tidak ditemukan.' });
    }
}

// 17. GClone (Owner only)
async function gcloneCommand(sock, message, text) {
    const senderJid = message.key.remoteJid;
    if (senderJid !== ownerNumber) {
        return sock.sendMessage(senderJid, { text: '❌ Hanya owner yang bisa menggunakan command ini!' });
    }
    
    const githubLink = text.split(' ')[1];
    if (!githubLink) return sock.sendMessage(senderJid, { text: 'Masukkan link GitHub. Contoh: .gclone https://github.com/user/repo' });
    
    try {
        await sock.sendMessage(senderJid, { text: '⏳ Sedang mengclone repository...' });
        const repoName = githubLink.split('/').pop().replace('.git', '');
        const cloneDir = path.join('/tmp', repoName);
        
        await execAsync(`git clone ${githubLink} ${cloneDir} --depth=1`);
        
        // Get some info about the repo
        const { stdout: branchOutput } = await execAsync(`cd ${cloneDir} && git branch --show-current`);
        const { stdout: commitOutput } = await execAsync(`cd ${cloneDir} && git log --oneline -1`);
        
        await sock.sendMessage(senderJid, { 
            text: `✅ Repository berhasil di-clone!\n\n📁 *Nama:* ${repoName}\n🌿 *Branch:* ${branchOutput.trim()}\n📝 *Last Commit:* ${commitOutput.trim()}\n📂 *Location:* ${cloneDir}` 
        });
        
        // Cleanup after 5 minutes
        setTimeout(async () => {
            try {
                await execAsync(`rm -rf ${cloneDir}`);
            } catch (e) {}
        }, 5 * 60 * 1000);
        
    } catch (error) {
        console.error(error);
        await sock.sendMessage(senderJid, { text: '❌ Gagal meng-clone repository.' });
    }
}

// 18. API Status (Owner only)
async function apistatusCommand(sock, message) {
    const senderJid = message.key.remoteJid;
    if (senderJid !== ownerNumber) {
        return sock.sendMessage(senderJid, { text: '❌ Hanya owner yang bisa menggunakan command ini!' });
    }
    
    try {
        const apis = [
            { name: 'GitHub API', url: 'https://api.github.com' },
            { name: 'NPM Registry', url: 'https://registry.npmjs.org' },
            { name: 'YouTube', url: 'https://www.youtube.com' },
            { name: 'Instagram', url: 'https://www.instagram.com' },
            { name: 'TikTok', url: 'https://www.tiktok.com' }
        ];
        
        let statusText = '*API Status Check*\n\n';
        
        for (const api of apis) {
            try {
                await axios.get(api.url, { timeout: 5000 });
                statusText += `✅ ${api.name}: ONLINE\n`;
            } catch {
                statusText += `❌ ${api.name}: OFFLINE\n`;
            }
        }
        
        statusText += `\n⏰ *Waktu:* ${new Date().toLocaleString()}`;
        await sock.sendMessage(senderJid, { text: statusText });
    } catch (error) {
        await sock.sendMessage(senderJid, { text: '❌ Gagal mengecek status API.' });
    }
}

// 19. Log (Owner only)
async function logCommand(sock, message) {
    const senderJid = message.key.remoteJid;
    if (senderJid !== ownerNumber) {
        return sock.sendMessage(senderJid, { text: '❌ Hanya owner yang bisa menggunakan command ini!' });
    }
    
    try {
        const logText = `*System Log*\n\n📊 *Uptime:* ${Math.floor(process.uptime())} detik\n💾 *Memory Usage:* ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\n📈 *Node Version:* ${process.version}\n🖥️ *Platform:* ${os.platform()}\n🏠 *Home Dir:* ${os.homedir()}\n👤 *User Info:* ${os.userInfo().username}\n⏰ *Current Time:* ${new Date().toLocaleString()}`;
        await sock.sendMessage(senderJid, { text: logText });
    } catch (error) {
        await sock.sendMessage(senderJid, { text: '❌ Gagal mengambil log.' });
    }
}

// 20. Tebak Kata
async function tebakkataCommand(sock, message) {
    try {
        // Create sample tebak kata if file doesn't exist
        if (!existsSync(tbkkataPath)) {
            const sampleData = [
                { soal: "Apa yang selalu datang tetapi tidak pernah tiba?", jawab: "besok" },
                { soal: "Aku punya kota tapi tidak ada rumah, punya hutan tapi tidak ada pohon, punya sungai tapi tidak ada air. Apakah aku?", jawab: "peta" },
                { soal: "Bisa berbicara berbagai bahasa tapi tidak punya mulut, apa itu?", jawab: "buku" },
                { soal: "Apa yang punya kaki tetapi tidak bisa berjalan?", jawab: "meja" },
                { soal: "Semakin banyak diambil, semakin besar. Apa itu?", jawab: "lubang" }
            ];
            await writeFile(tbkkataPath, JSON.stringify(sampleData, null, 2));
        }
        
        const data = JSON.parse(await readFile(tbkkataPath, 'utf8'));
        const randomQuiz = data[Math.floor(Math.random() * data.length)];
        
        await sock.sendMessage(message.key.remoteJid, { 
            text: `*Tebak Kata*\n\n${randomQuiz.soal}\n\nKetik jawabanmu!` 
        });
        
        // Store the answer for verification (in a real implementation, you'd use a proper state management)
        // For simplicity, we'll just send the answer
        setTimeout(async () => {
            await sock.sendMessage(message.key.remoteJid, { 
                text: `*Jawaban:* ${randomQuiz.jawab}` 
            });
        }, 30000); // Show answer after 30 seconds
        
    } catch (error) {
        console.error(error);
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal memuat permainan tebak kata.' });
    }
}

// 21. Math Quiz
async function mathquizCommand(sock, message) {
    try {
        const operations = ['+', '-', '*'];
        const num1 = Math.floor(Math.random() * 50) + 1;
        const num2 = Math.floor(Math.random() * 50) + 1;
        const operation = operations[Math.floor(Math.random() * operations.length)];
        
        let answer;
        switch (operation) {
            case '+': answer = num1 + num2; break;
            case '-': answer = num1 - num2; break;
            case '*': answer = num1 * num2; break;
        }
        
        await sock.sendMessage(message.key.remoteJid, { 
            text: `*Math Quiz*\n\nBerapa hasil dari: ${num1} ${operation} ${num2}?\n\nKetik jawabanmu!` 
        });
        
        setTimeout(async () => {
            await sock.sendMessage(message.key.remoteJid, { 
                text: `*Jawaban:* ${answer}` 
            });
        }, 30000); // Show answer after 30 seconds
        
    } catch (error) {
        console.error(error);
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal memuat permainan math quiz.' });
    }
}

// 22. Tebak Angka
async function tebakangkaCommand(sock, message) {
    try {
        const secretNumber = Math.floor(Math.random() * 100) + 1;
        
        await sock.sendMessage(message.key.remoteJid, { 
            text: `*Tebak Angka*\n\nSaya memikirkan angka antara 1 sampai 100.\nCoba tebak! Ketik angkamu.` 
        });
        
        setTimeout(async () => {
            await sock.sendMessage(message.key.remoteJid, { 
                text: `*Jawaban:* ${secretNumber}\n\nKetik .tebakangka untuk bermain lagi!` 
            });
        }, 60000); // Show answer after 60 seconds
        
    } catch (error) {
        console.error(error);
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal memuat permainan tebak angka.' });
    }
}

// 23. Cek Fun (Random Percentage)
function cekFun(sock, message, text, type) {
    const mentions = parseMention(text);
    if (mentions.length === 0) return sock.sendMessage(message.key.remoteJid, { text: `Tag orang yang ingin dicek ${type}! Contoh: .cek${type} @orang` });
    const target = mentions[0];
    const percentage = Math.floor(Math.random() * 101);
    const labels = {
        'iman': '🧎 Iman',
        'femboy': '👗 Femboy',
        'furry': '🐾 Furry',
        'jamet': '👖 Jamet'
    };
    sock.sendMessage(message.key.remoteJid, { 
        text: `*Hasil Cek ${labels[type]}*\n\n@${target.split('@')[0]} adalah ${type} sebesar: ${percentage}%`,
        mentions: [target] 
    }, { quoted: message });
}

// 24. Link Group
async function linkCommand(sock, message) {
    const isGroup = message.key.remoteJid.endsWith('@g.us');
    if (!isGroup) return sock.sendMessage(message.key.remoteJid, { text: 'Fitur ini hanya untuk grup!' });
    
    try {
        const groupInviteCode = await sock.groupInviteCode(message.key.remoteJid);
        const inviteLink = `https://chat.whatsapp.com/${groupInviteCode}`;
        await sock.sendMessage(message.key.remoteJid, { text: `*Link Group*\n\n${inviteLink}` });
    } catch (error) {
        console.error(error);
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal membuat link grup. Pastikan bot adalah admin.' });
    }
}

// --- FUNGSI UTAMA BOT ---
async function startBot() {
    console.log('Memulai bot WhatsApp...');

    // Inisialisasi database
    await initDatabase();
    console.log('✅ Database siap.');

    // Buat directory auth jika belum ada
    try {
        await mkdirSync(authPath, { recursive: true });
    } catch (e) {}

    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Menggunakan WA Web v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        defaultStoreOptions: { syncHistory: false },
        logger: {
            level: 'silent' // Reduce console noise
        }
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
            console.log(`📱 Nomor: ${sock.user.id}`);
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
        console.log(`Text: ${messageText}`);
        console.log(`--------------------\n`);

        // --- SISTEM VERIFIKASI & SELF ---
        if (command !== '.verify' && !(await isUserVerified(senderJid))) {
            return sock.sendMessage(senderJid, { text: '❌ Kamu belum terverifikasi. Ketik *.verify* untuk menggunakan bot.' });
        }
        if (selfMode && senderJid !== ownerNumber) {
            return sock.sendMessage(senderJid, { text: '❌ Bot sedang dalam mode self. Hanya owner yang bisa menggunakan.' });
        }
        // --- AKHIR SISTEM ---

        try {
            switch (command) {
                case '.menu': 
                case '.help': 
                    await showMenu(sock, msg); 
                    break;
                case '.verify': 
                    await verifyCommand(sock, msg); 
                    break;
                case '.self': 
                    await selfCommand(sock, msg); 
                    break;
                case '.unself': 
                    await unselfCommand(sock, msg); 
                    break;
                case '.tos': 
                case '.tostiktok': 
                    await tosCommand(sock, msg, messageText); 
                    break;
                case '.ig': 
                    await igCommand(sock, msg, messageText); 
                    break;
                case '.playyt': 
                    await playytCommand(sock, msg, messageText); 
                    break;
                case '.yt': 
                    await ytCommand(sock, msg, messageText); 
                    break;
                case '.tostiker': 
                    await tostikerCommand(sock, msg, messageText); 
                    break;
                case '.stiker': 
                    await stikerCommand(sock, msg, messageText); 
                    break;
                case '.tomedia': 
                    await tomediaCommand(sock, msg); 
                    break;
                case '.gig': 
                    await gigCommand(sock, msg); 
                    break;
                case '.grup': 
                    await grupCommand(sock, msg, messageText); 
                    break;
                case '.totag': 
                    await totagCommand(sock, msg, messageText); 
                    break;
                case '.kick': 
                    await kickCommand(sock, msg, messageText); 
                    break;
                case '.ban': 
                    await banCommand(sock, msg, messageText); 
                    break;
                case '.github': 
                    await githubCommand(sock, msg, messageText); 
                    break;
                case '.npm': 
                    await npmCommand(sock, msg, messageText); 
                    break;
                case '.gclone': 
                    await gcloneCommand(sock, msg, messageText); 
                    break;
                case '.apistatus': 
                    await apistatusCommand(sock, msg); 
                    break;
                case '.log': 
                    await logCommand(sock, msg); 
                    break;
                case '.tebakkata': 
                    await tebakkataCommand(sock, msg); 
                    break;
                case '.mathquiz': 
                    await mathquizCommand(sock, msg); 
                    break;
                case '.tebakangka': 
                    await tebakangkaCommand(sock, msg); 
                    break;
                case '.cekiman': 
                    cekFun(sock, msg, messageText, 'iman'); 
                    break;
                case '.cekfemboy': 
                    cekFun(sock, msg, messageText, 'femboy'); 
                    break;
                case '.cekfurry': 
                    cekFun(sock, msg, messageText, 'furry'); 
                    break;
                case '.cekjamet': 
                    cekFun(sock, msg, messageText, 'jamet'); 
                    break;
                case '.link': 
                    await linkCommand(sock, msg); 
                    break;
                case '.ping': 
                    await sock.sendMessage(senderJid, { text: '🏓 Pong!' }); 
                    break;
                default: 
                    await sock.sendMessage(senderJid, { text: `❌ Command "${command}" tidak ditemukan. Ketik .menu untuk melihat daftar command.` }); 
                    break;
            }
        } catch (error) {
            console.error(`❌ Error saat menjalankan command ${command}:`, error);
            await sock.sendMessage(senderJid, { text: '❌ Maaf, terjadi kesalahan.' });
        }
    });
}

// Jalankan bot
startBot().catch(err => {
    console.error("Gagal menjalankan bot:", err);
});
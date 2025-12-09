import Baileys from '@adiwajshing/baileys';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import os from 'os';

// Ekstrak fungsi dari Baileys
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeInMemoryStore } = Baileys;

// Fungsi untuk mendapatkan informasi sistem
const getSystemInfo = () => {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  
  return {
    cpu: {
      model: cpus[0]?.model || 'Unknown',
      cores: cpus.length,
      usage: Math.round(Math.random() * 100)
    },
    ram: {
      total: Math.round(totalMem / (1024 * 1024 * 1024) * 100) / 100 + ' GB',
      used: Math.round(usedMem / (1024 * 1024 * 1024) * 100) / 100 + ' GB',
      free: Math.round(freeMem / (1024 * 1024 * 1024) * 100) / 100 + ' GB',
      usage: Math.round((usedMem / totalMem) * 100) + '%'
    },
    disk: {
      total: 'Unknown GB',
      used: 'Unknown GB',
      free: 'Unknown GB',
      usage: 'Unknown%'
    }
  };
};

// Fungsi untuk menampilkan menu
const showMenu = (sock, jid) => {
  const systemInfo = getSystemInfo();
  const menu = `╭╼━━━━━━━━━━━━━━━━━━━━╾❐
│ 𝗪𝗜𝗡𝗗𝗕𝗜 𝗕𝗢𝗧 𝗪𝗛𝗔𝗧𝗦𝗔𝗣𝗣
├╼━━━━━━━━━━━━━━━━━━━━╾╮
│ 𝗨𝗣𝗧𝗜𝗠𝗘 𝗦𝗬𝗦𝗧𝗘𝗠
│ • CPU   : ${systemInfo.cpu.model} (${systemInfo.cpu.cores} cores)
│ • RAM   : ${systemInfo.ram.used} / ${systemInfo.ram.total}
│ • DISK  : ${systemInfo.disk.used} / ${systemInfo.disk.total}
│
│ 𝗦𝗧𝗔𝗧𝗨𝗦 : Online
├╼━━━━━━━━━━━━━━━━━━━━╾〢
│ Bot ini dibuat oleh aal
│ [humpreyDev]. Bot simple
│ menggunakan Node.js. Ini
│ adalah project kedua setelah
│ Windbi-Om AI.
╰╼━━━━━━━━━━━━━━━━━━━━╾❏


╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗣𝗨𝗕𝗟𝗜𝗞 ⧽━╾❐
│ • .verify
│ • .link
│ • .gig
│ • .github
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗚𝗔𝗠𝗘𝗦 ⧽━╾❐
│ • .tebakkata
│ • .mathquiz
│ • .tebakangka
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗙𝗨𝗡 ⧽━╾❐
│ • .cekiman <@..>
│ • .cekfemboy <@..>
│ • .cekfurry <@..>
│ • .cekjamet <@..>
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗥 ⧽━╾❐
│ • .playyt <link>
│ • .yt <url>
│ • .ig <url>
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗔𝗗𝗠𝗜𝗡 ⧽━╾❐
│ • .kick <@..>
│ • .ban <@..>
│ • .grup buka|tutup
│ • .totag
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗢𝗪𝗡𝗘𝗥 ⧽━╾❐
│ • .npm <library>
│ • .gclone <github link>
│ • .apistatus
╰╼━━━━━━━━━━━━━━━━╾❏


> Copyright © humpreyDev
> "Setiap file yang gua ketik,
> pasti ada 100 error, tapi
> 1% progress tetap progress."`;

  sock.sendMessage(jid, { text: menu });
};

// Fungsi untuk menangani perintah
const handleCommand = async (sock, msg, command, args) => {
  const jid = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  
  switch (command) {
    case '.verify':
      await sock.sendMessage(jid, { text: 'Verifikasi berhasil! Selamat datang di bot Windbi.' });
      break;
      
    case '.link':
      await sock.sendMessage(jid, { text: 'Link bot: https://github.com/humpreyDev/windbi-bot' });
      break;
      
    case '.gig':
      await sock.sendMessage(jid, { text: 'Gig bot: https://gig.com/bot-windbi' });
      break;
      
    case '.github':
      await sock.sendMessage(jid, { text: 'GitHub: https://github.com/humpreyDev' });
      break;
      
    case '.tebakkata':
      await sock.sendMessage(jid, { text: 'Permainan tebak kata sedang dikembangkan...' });
      break;
      
    case '.mathquiz':
      await sock.sendMessage(jid, { text: 'Kuis matematika sedang dikembangkan...' });
      break;
      
    case '.tebakangka':
      await sock.sendMessage(jid, { text: 'Permainan tebak angka sedang dikembangkan...' });
      break;
      
    case '.cekiman':
      if (args[0]) {
        await sock.sendMessage(jid, { text: `Memanja ${args[0]}: 100%` });
      } else {
        await sock.sendMessage(jid, { text: 'Usage: .cekiman <@user>' });
      }
      break;
      
    case '.cekfemboy':
      if (args[0]) {
        await sock.sendMessage(jid, { text: `Femboy level ${args[0]}: 95%` });
      } else {
        await sock.sendMessage(jid, { text: 'Usage: .cekfemboy <@user>' });
      }
      break;
      
    case '.cekfurry':
      if (args[0]) {
        await sock.sendMessage(jid, { text: `Furry level ${args[0]}: 80%` });
      } else {
        await sock.sendMessage(jid, { text: 'Usage: .cekfurry <@user>' });
      }
      break;
      
    case '.cekjamet':
      if (args[0]) {
        await sock.sendMessage(jid, { text: `Jamet level ${args[0]}: 99%` });
      } else {
        await sock.sendMessage(jid, { text: 'Usage: .cekjamet <@user>' });
      }
      break;
      
    case '.playyt':
      if (args[0]) {
        await sock.sendMessage(jid, { text: `Memutar dari YouTube: ${args[0]}` });
      } else {
        await sock.sendMessage(jid, { text: 'Usage: .playyt <link>' });
      }
      break;
      
    case '.yt':
      if (args[0]) {
        await sock.sendMessage(jid, { text: `Mengunduh dari YouTube: ${args[0]}` });
      } else {
        await sock.sendMessage(jid, { text: 'Usage: .yt <url>' });
      }
      break;
      
    case '.ig':
      if (args[0]) {
        await sock.sendMessage(jid, { text: `Mengunduh dari Instagram: ${args[0]}` });
      } else {
        await sock.sendMessage(jid, { text: 'Usage: .ig <url>' });
      }
      break;
      
    case '.kick':
      if (args[0]) {
        await sock.groupParticipantsUpdate(jid, [args[0].replace('@', '').replace(':', '')], 'remove');
        await sock.sendMessage(jid, { text: `User ${args[0]} telah di kick` });
      } else {
        await sock.sendMessage(jid, { text: 'Usage: .kick <@user>' });
      }
      break;
      
    case '.ban':
      if (args[0]) {
        await sock.groupParticipantsUpdate(jid, [args[0].replace('@', '').replace(':', '')], 'remove');
        await sock.sendMessage(jid, { text: `User ${args[0]} telah di ban` });
      } else {
        await sock.sendMessage(jid, { text: 'Usage: .ban <@user>' });
      }
      break;
      
    case '.grup':
      if (args[0] === 'buka') {
        await sock.groupSettingUpdate(jid, 'not_announcement');
        await sock.sendMessage(jid, { text: 'Grup telah dibuka' });
      } else if (args[0] === 'tutup') {
        await sock.groupSettingUpdate(jid, 'announcement');
        await sock.sendMessage(jid, { text: 'Grup telah ditutup' });
      } else {
        await sock.sendMessage(jid, { text: 'Usage: .grup buka|tutup' });
      }
      break;
      
    case '.totag':
      const participants = await sock.groupMetadata(jid).then(metadata => metadata.participants);
      const tags = participants.map(p => `@${p.id.split('@')[0]}`).join(' ');
      await sock.sendMessage(jid, { text: tags, mentions: participants.map(p => p.id) });
      break;
      
    case '.npm':
      if (args[0]) {
        await sock.sendMessage(jid, { text: `Mencari ${args[0]} di npm...` });
      } else {
        await sock.sendMessage(jid, { text: 'Usage: .npm <library>' });
      }
      break;
      
    case '.gclone':
      if (args[0]) {
        await sock.sendMessage(jid, { text: `Cloning ${args[0]}...` });
      } else {
        await sock.sendMessage(jid, { text: 'Usage: .gclone <github link>' });
      }
      break;
      
    case '.apistatus':
      await sock.sendMessage(jid, { text: 'API Status: Online' });
      break;
      
    default:
      if (command.startsWith('.')) {
        await sock.sendMessage(jid, { text: 'Perintah tidak dikenal. Ketik .menu untuk melihat daftar perintah.' });
      }
  }
};

// Fungsi utama
const main = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: ['Windbi Bot', 'Chrome', '1.0.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error instanceof Error) 
        && lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
      console.log('Koneksi terputus, mencoba reconnect...', shouldReconnect);
      if (shouldReconnect) {
        main();
      }
    } else if (connection === 'open') {
      console.log('Koneksi berhasil terbuka!');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.key.fromMe && msg.message) {
      const text = msg.message.conversation || 
                   msg.message.extendedTextMessage?.text || 
                   msg.message.imageMessage?.caption || 
                   msg.message.videoMessage?.caption || 
                   msg.message.audioMessage?.caption;
      
      if (text) {
        const args = text.trim().split(' ');
        const command = args.shift();
        
        if (command === '.menu') {
          showMenu(sock, msg.key.remoteJid);
        } else {
          await handleCommand(sock, msg, command, args);
        }
      }
    }
  });

  sock.ev.on('group-participants.update', async (update) => {
    const { id, participants, action } = update;
    const welcomeText = 'Selamat datang di grup!';
    
    if (action === 'add') {
      for (const participant of participants) {
        await sock.sendMessage(id, { text: `${welcomeText} @${participant.split('@')[0]}`, mentions: [participant] });
      }
    }
  });
};

main();
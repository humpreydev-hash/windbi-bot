// cleanup.js - Hapus session corrupt
const fs = require('fs');
const path = require('path');

const sessionDir = './session';

if (fs.existsSync(sessionDir)) {
    console.log('🗑️  Menghapus session lama...');
    
    // Hapus semua file di session
    const files = fs.readdirSync(sessionDir);
    files.forEach(file => {
        const filePath = path.join(sessionDir, file);
        fs.unlinkSync(filePath);
        console.log(`Deleted: ${file}`);
    });
    
    // Hapus folder session
    fs.rmdirSync(sessionDir);
    console.log('✅ Session lama dihapus');
} else {
    console.log('ℹ️  Folder session tidak ditemukan');
}

console.log('🔄 Sekarang jalankan: npm start');
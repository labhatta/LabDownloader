const fs = require('fs');
const path = require('path');

const keepVersion = process.argv[2];
const distDir = path.resolve(__dirname, '..', 'dist-package');

if (!fs.existsSync(distDir)) {
  console.log('[*] Folder dist-package belum ada. Melewati pembersihan.');
  process.exit(0);
}

console.log(`[*] Membersihkan build versi lama dari folder dist-package (menjaga versi ${keepVersion || 'terbaru'})...`);

const files = fs.readdirSync(distDir);
let deletedCount = 0;

for (const file of files) {
  const fullPath = path.join(distDir, file);
  const stat = fs.statSync(fullPath);

  // Jangan sentuh subfolder (seperti win-unpacked)
  if (stat.isDirectory()) continue;

  // Hanya periksa file installer exe, portable exe, atau blockmap
  if (file.startsWith('LabDownloader') || file.endsWith('.blockmap')) {
    if (keepVersion && !file.includes(keepVersion)) {
      try {
        fs.unlinkSync(fullPath);
        console.log(`    [-] Dihapus (versi lama): ${file}`);
        deletedCount++;
      } catch (err) {
        console.warn(`    [!] Gagal menghapus ${file}:`, err.message);
      }
    }
  }
}

if (deletedCount === 0) {
  console.log('    [+] Tidak ada file versi lama yang perlu dihapus.');
} else {
  console.log(`    [+] Selesai! Sebanyak ${deletedCount} file versi lama berhasil dibersihkan.`);
}

const fs = require('fs');
fs.rmSync('www', { recursive: true, force: true });
fs.cpSync('src', 'www', { recursive: true });
console.log('src -> www copiado');
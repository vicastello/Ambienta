const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.builds', 'config', '.env');

try {
  const contents = fs.readFileSync(envPath, 'utf8');
  contents.split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) return;
    const [key, value] = line.split(/=(.*)/s);
    if (!key || process.env[key] !== undefined) return;
    process.env[key] = value?.trim().replace(/^"(.*)"$/, '$1') ?? '';
  });
} catch (error) {
  console.warn('[start-server] Falha ao carregar .env', error?.message ?? error);
}

require('./server.js');

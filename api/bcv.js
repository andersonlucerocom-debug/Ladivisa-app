const https = require('https');

const bcvAgent = new https.Agent({ rejectUnauthorized: false });

function fetchHtml(url, ms = 7000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      agent: bcvAgent,
      timeout: ms,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html'
      }
    }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout BCV')); });
    req.on('error', reject);
  });
}

function extractRate(html, id) {
  const re = new RegExp(`id=["']${id}["'][\\s\\S]*?<strong>\\s*([0-9.,]+)\\s*<\\/strong>`, 'i');
  const m = html.match(re);
  if (!m) return null;
  const val = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(val) ? val : null;
}

function extractFechaValor(html) {
  const m = html.match(/class=["'][^"']*date-display-single[^"']*["'][^>]*>([^<]+)</i);
  return m ? m[1].trim() : '';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  try {
    const html = await fetchHtml('https://www.bcv.org.ve/');
    const usd = extractRate(html, 'dolar');
    const eur = extractRate(html, 'euro');
    const cny = extractRate(html, 'yuan');
    const tryRate = extractRate(html, 'lira');
    const rub = extractRate(html, 'rublo');

    if (!usd) throw new Error('No se pudo leer USD en BCV');

    return res.status(200).json({
      source: 'BCV (Oficial)',
      fechaValor: extractFechaValor(html),
      last_update: new Date().toISOString(),
      usd,
      eur,
      cny,
      try: tryRate,
      rub
    });
  } catch (err) {
    try {
      const [rUsd, rEur] = await Promise.all([
        fetch('https://ve.dolarapi.com/v1/dolares/oficial').then(r => r.json()),
        fetch('https://ve.dolarapi.com/v1/euros/oficial').then(r => r.json())
      ]);
      return res.status(200).json({
        source: 'BCV (Respaldo)',
        fechaValor: '',
        last_update: rUsd.fechaActualizacion || new Date().toISOString(),
        usd: rUsd.promedio,
        eur: rEur.promedio,
        cny: null,
        try: null,
        rub: null
      });
    } catch (fallbackErr) {
      return res.status(502).json({ error: 'No se pudo conectar con BCV ni respaldo' });
    }
  }
};

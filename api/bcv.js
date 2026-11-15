const https = require('https');
const http = require('http');
const crypto = require('crypto');
const zlib = require('zlib');

const bcvAgent = new https.Agent({
  rejectUnauthorized: false,
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT
});

function fetchHtml(url, ms = 8000, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 4) return reject(new Error('Demasiadas redirecciones'));
    const client = url.startsWith('https') ? https : http;
    const options = {
      timeout: ms,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-VE,es;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache'
      }
    };
    if (url.startsWith('https')) options.agent = bcvAgent;

    const req = client.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const nextUrl = new URL(res.headers.location, url).toString();
        return resolve(fetchHtml(nextUrl, ms, redirects + 1));
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }

      let stream = res;
      const enc = (res.headers['content-encoding'] || '').toLowerCase();
      if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
      else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
      else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());

      const chunks = [];
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      stream.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout BCV')); });
    req.on('error', reject);
  });
}

function extractRate(html, id) {
  const re = new RegExp(`id=["']${id}["'][\\s\\S]{0,700}?<strong>[\\s\\S]*?([0-9]{1,3}(?:\\.[0-9]{3})*,[0-9]+|[0-9]+,[0-9]+)`, 'i');
  const m = html.match(re);
  if (!m) return null;
  const val = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(val) ? val : null;
}

function extractFechaValor(html) {
  const m = html.match(/class=["'][^"']*date-display-single[^"']*["'][^>]*>([^<]+)</i);
  return m ? m[1].replace(/ /gi, ' ').trim() : '';
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

    if (!usd) {
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const pageTitle = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim().slice(0, 80) : 'Sin título';
      throw new Error(`Sin tasa USD (título: "${pageTitle}", bytes: ${html.length})`);
    }

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
        bcv_error: err.message,
        fechaValor: '',
        last_update: rUsd.fechaActualizacion || new Date().toISOString(),
        usd: rUsd.promedio,
        eur: rEur.promedio,
        cny: null,
        try: null,
        rub: null
      });
    } catch (fallbackErr) {
      return res.status(502).json({ error: 'No se pudo conectar con BCV ni respaldo', bcv_error: err.message });
    }
  }
};

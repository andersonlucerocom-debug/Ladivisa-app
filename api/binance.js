export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Estas tres líneas son la magia para DESTRUIR la caché en el servidor
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const askBinance = async (tradeType) => {
      const response = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          asset: 'USDT', fiat: 'VES', tradeType, page: 1, rows: 10, payTypes: [], publisherType: null, merchantCheck: true 
        })
      });
      
      const json = await response.json();
      const ads = (json.data || []).map(d => parseFloat(d.adv.price)).filter(n => !isNaN(n));
      ads.sort((a,b) => a-b);
      return ads[Math.floor(ads.length/2)];
    };

    const [sell, buy] = await Promise.all([askBinance('SELL'), askBinance('BUY')]);
    const price = (sell + buy) / 2;

    res.status(200).json({ price, source: 'Binance P2P (En vivo)' });

  } catch (error) {
    res.status(500).json({ error: 'No se pudo conectar con Binance' });
  }
}

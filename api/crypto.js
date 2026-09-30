export default async function handler(req, res) {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether,usd-coin&vs_currencies=usd');
    
    if (!response.ok) {
      throw new Error(`CoinGecko falló con estado: ${response.status}`);
    }
    
    const data = await response.json();

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.status(200).json(data);
  } catch (error) {
    console.error('Error interno en proxy de crypto:', error);
    res.status(500).json({ error: 'Fallo al conectar con CoinGecko' });
  }
}

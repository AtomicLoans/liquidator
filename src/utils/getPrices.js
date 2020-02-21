const axios = require('axios')

async function BlockchainInfo () {
  const { data } = await axios.get(
    'https://blockchain.info/ticker?currency=USD'
  )

  return data.USD.last
}

async function BitBay () {
  const { data } = await axios.get('https://bitbay.net/API/Public/btcusd/ticker.json')

  return data.last
}

async function CoinMarketCap () {
  const { data } = await axios.get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=BTC', { headers: { 'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_API_KEY } })

  return data.data.BTC.quote.USD.price
}

async function CryptoCompare () {
  const { data } = await axios.get(`https://min-api.cryptocompare.com/data/price?fsym=BTC&tsyms=USD&api_key=${process.env.CRYPTOCOMPARE_API_KEY}`)

  return data.USD
}

async function Gemini () {
  const { data } = await axios.get(
    'https://api.gemini.com/v1/pubticker/btcusd'
  )

  return data.last
}

async function Bitstamp () {
  const { data } = await axios.get(
    'https://www.bitstamp.net/api/v2/ticker/btcusd'
  )

  return data.last
}

async function Coinbase () {
  const { data } = await axios.get('https://api.pro.coinbase.com/products/BTC-USD/ticker')

  return data.price
}

async function CryptoWatch () {
  const { data } = await axios.get('https://api.cryptowat.ch/markets/coinbase-pro/btcusd/price')

  return data.result.price
}

async function Coinpaprika () {
  const { data } = await axios.get(
    'https://api.coinpaprika.com/v1/tickers/btc-bitcoin'
  )

  return data.quotes.USD.price
}

async function Kraken () {
  const { data } = await axios.get(
    'https://api.kraken.com/0/public/Ticker?pair=XBTUSD'
  )

  return data.result.XXBTZUSD.c[0]
}

module.exports = {
  BlockchainInfo,
  BitBay,
  CoinMarketCap,
  CryptoCompare,
  Gemini,
  Bitstamp,
  Coinbase,
  CryptoWatch,
  Coinpaprika,
  Kraken
}

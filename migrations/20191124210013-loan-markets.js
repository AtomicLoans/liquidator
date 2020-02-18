const axios = require('axios')

const markets = [
  { from: 'BTC', to: 'ETH' },
  { from: 'ETH', to: 'BTC' },
  { from: 'BTC', to: 'DAI' },
  { from: 'BTC', to: 'USDC' }
]

const loanMarkets = [
  { collateral: 'BTC', principal: 'DAI', chain: 'ETH' },
  { collateral: 'BTC', principal: 'USDC', chain: 'ETH' }
]

module.exports = {
  async up (db, client) {
    const marketsCount = await db.collection('markets').countDocuments()
    const loanMarketsCount = await db.collection('loanmarkets').countDocuments()

    if (marketsCount === 0) {
      for (let i = 0; i < markets.length; i++) {
        const { data: { data: { amount: fromPrice } } } = await axios(`https://api.coinbase.com/v2/prices/${markets[i].from}-USD/spot`)
        const { data: { data: { amount: toPrice } } } = await axios(`https://api.coinbase.com/v2/prices/${markets[i].to}-USD/spot`)

        const rate = (parseFloat(fromPrice) / parseFloat(toPrice)).toFixed(4)

        await db.collection('markets').insertOne({
          from: markets[i].from,
          to: markets[i].to,
          min: 0.001,
          max: 2.5,
          minConf: 1,
          rate: rate,
          orderExpiresIn: 3600000,
          status: 'ACTIVE'
        })
      }
    }

    if (loanMarketsCount === 0) {
      for (let i = 0; i < loanMarkets.length; i++) {
        await db.collection('loanmarkets').insertOne({
          collateral: loanMarkets[i].collateral,
          principal: loanMarkets[i].principal,
          chain: loanMarkets[i].chain,
          minPrincipal: 10,
          maxPrincipal: 2000,
          minCollateral: 0.002,
          maxCollateral: 0.3,
          minLoanDuration: 21600,
          requestExpiresIn: 600000,
          minConf: 1,
          status: 'ACTIVE'
        })
      }
    }
  },

  async down (db, client) {
    const marketsCount = await db.collection('markets').countDocuments()
    const loanMarketsCount = await db.collection('loanmarkets').countDocuments()

    if (marketsCount > 0) {
      for (let i = 0; i < markets.length; i++) {
        await db.collection('markets').deleteOne({ from: markets[i].from, to: markets[i].to })
      }
    }

    if (loanMarketsCount > 0) {
      for (let i = 0; i < loanMarkets.length; i++) {
        await db.collection('loanmarkets').deleteOne({ collateral: loanMarkets[i].from, principal: loanMarkets[i].to })
      }
    }
  }
}

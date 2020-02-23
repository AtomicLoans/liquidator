module.exports = {
  async up (db) {
    await db.collection('loanmarkets').deleteOne({ collateral: 'BTC', principal: 'SAI' })
    await db.collection('markets').deleteOne({ from: 'BTC', to: 'SAI' })
  },

  async down (db) {
    await db.collection('loanmarkets').insertOne({ collateral: 'BTC', principal: 'SAI', chain: 'ETH', minPrincipal: 10, maxPrincipal: 2000, minCollateral: 0.002, maxCollateral: 0.3, minLoanDuration: 21600, requestExpiresIn: 600000, minConf: 1, status: 'ACTIVE' })
    await db.collection('markets').insertOne({ from: 'BTC', to: 'SAI', min: 0.001, max: 2.5, minConf: 1, rate: 7000, orderExpiresIn: 3600000, status: 'ACTIVE' })
  }
}

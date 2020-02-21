const LoanMarket = require('../../../models/LoanMarket')
const { getObject } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')

function defineLiquidatorStatusJobs (agenda) {
  agenda.define('check-liquidator-status', async (job, done) => {
    console.log('Updating liquidator status')

    const loanMarkets = await LoanMarket.find().exec()

    for (let i = 0; i < loanMarkets.length; i++) {
      const loanMarket = loanMarkets[i]
      const { principal } = loanMarket

      const loans = getObject('loans', principal)

      const loanIndex = await loans.methods.loanIndex().call()
      
      if (loanMarket.loanIndex < loanIndex) {
        agenda.now('update-loan-records', { loanMarketId: loanMarket.id })
      }
    }

    done()
  })
}

module.exports = {
  defineLiquidatorStatusJobs
}

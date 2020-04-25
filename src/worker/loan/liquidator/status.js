const LoanMarket = require('../../../models/LoanMarket')
const { getObject } = require('../../../utils/contracts')
const handleError = require('../../../utils/handleError')

function defineLiquidatorStatusJobs (agenda) {
  agenda.define('check-liquidator-status', async (job, done) => {
    console.log('Updating liquidator status')

    const loanMarkets = await LoanMarket.find().exec()

    try {
      for (let i = 0; i < loanMarkets.length; i++) {
        const loanMarket = loanMarkets[i]
        const { principal } = loanMarket

        const loans = getObject('loans', principal)

        const loanIndex = await loans.methods.loanIndex().call()

        if (loanMarket.loanIndex < loanIndex) {
          agenda.now('update-loan-records', { loanMarketId: loanMarket.id })
        }
      }
    } catch (e) {
      console.log(e)
      handleError(e)
    }
    done()
  })
}

module.exports = {
  defineLiquidatorStatusJobs
}

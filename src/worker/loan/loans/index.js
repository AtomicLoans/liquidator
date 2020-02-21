const { defineLoanLiquidateJobs } = require('./liquidate')
const { defineLoanStatusJobs } = require('./status')

function defineLoansJobs (agenda) {
  defineLoanLiquidateJobs(agenda)
  defineLoanStatusJobs(agenda)
}

module.exports = {
  defineLoansJobs
}

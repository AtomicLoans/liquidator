const { defineLiquidatorLoanJobs } = require('./loans')
const { defineLiquidatorStatusJobs } = require('./status')

function defineLiquidatorJobs (agenda) {
  defineLiquidatorLoanJobs(agenda)
  defineLiquidatorStatusJobs(agenda)
}

module.exports = {
  defineLiquidatorJobs
}

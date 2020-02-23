const { defineLiquidatorLoanJobs } = require('./loans')
const { defineLiquidatorStatusJobs } = require('./status')
const { defineOracleJobs } = require('./oracle')

function defineLiquidatorJobs (agenda) {
  defineLiquidatorLoanJobs(agenda)
  defineLiquidatorStatusJobs(agenda)
  defineOracleJobs(agenda)
}

module.exports = {
  defineLiquidatorJobs
}

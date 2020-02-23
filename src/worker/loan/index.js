const { defineLoansJobs } = require('./loans/index')
const { defineSalesJobs } = require('./sales/index')
const { defineLiquidatorJobs } = require('./liquidator/index')
const { defineAgentJobs } = require('./agent/index')
const { defineTxJobs } = require('./tx/index')

function defineLoanJobs (agenda) {
  defineLoansJobs(agenda)
  defineSalesJobs(agenda)
  defineLiquidatorJobs(agenda)
  defineAgentJobs(agenda)
  defineTxJobs(agenda)
}

module.exports = {
  defineLoanJobs
}

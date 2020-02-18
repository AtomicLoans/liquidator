const { defineFundsJobs } = require('./funds/index')
const { defineLoansJobs } = require('./loans/index')
const { defineSalesJobs } = require('./sales/index')
const { defineArbiterJobs } = require('./arbiter/index')
const { defineAgentJobs } = require('./agent/index')
const { defineTxJobs } = require('./tx/index')

function defineLoanJobs (agenda) {
  defineFundsJobs(agenda)
  defineLoansJobs(agenda)
  defineSalesJobs(agenda)
  defineArbiterJobs(agenda)
  defineAgentJobs(agenda)
  defineTxJobs(agenda)
}

module.exports = {
  defineLoanJobs
}

const { defineFundCreateJobs } = require('./create')
const { defineFundWithdrawJobs } = require('./withdraw')
const { defineFundDepositJobs } = require('./deposit')
const { defineFundUpdateJobs } = require('./update')

function defineFundsJobs (agenda) {
  defineFundCreateJobs(agenda)
  defineFundWithdrawJobs(agenda)
  defineFundDepositJobs(agenda)
  defineFundUpdateJobs(agenda)
}

module.exports = {
  defineFundsJobs
}

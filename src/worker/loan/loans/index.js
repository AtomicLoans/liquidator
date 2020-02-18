const { defineLoanRequestJobs } = require('./request')
const { defineLoanLockJobs } = require('./lock')
const { defineLoanApproveJobs } = require('./approve')
const { defineLoanAcceptOrCancelJobs } = require('./acceptOrCancel')
const { defineLoanStatusJobs } = require('./status')

function defineLoansJobs (agenda) {
  defineLoanRequestJobs(agenda)
  defineLoanLockJobs(agenda)
  defineLoanApproveJobs(agenda)
  defineLoanAcceptOrCancelJobs(agenda)
  defineLoanStatusJobs(agenda)
}

module.exports = {
  defineLoansJobs
}

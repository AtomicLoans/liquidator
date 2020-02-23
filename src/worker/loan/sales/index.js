const { defineSalesInitJobs } = require('./init')
const { defineSalesClaimJobs } = require('./claim')
const { defineSaleRefundJobs } = require('./refund')

function defineSalesJobs (agenda) {
  defineSalesInitJobs(agenda)
  defineSalesClaimJobs(agenda)
  defineSaleRefundJobs(agenda)
}

module.exports = {
  defineSalesJobs
}

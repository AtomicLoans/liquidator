const { defineSalesInitJobs } = require('./init')
const { defineSalesClaimJobs } = require('./claim')
const { defineSalesAcceptJobs } = require('./accept')

function defineSalesJobs (agenda) {
  defineSalesInitJobs(agenda)
  defineSalesClaimJobs(agenda)
  defineSalesAcceptJobs(agenda)
}

module.exports = {
  defineSalesJobs
}

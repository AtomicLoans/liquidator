const { defineSalesInitJobs } = require('./init')
const { defineSalesClaimJobs } = require('./claim')

function defineSalesJobs (agenda) {
  defineSalesInitJobs(agenda)
  defineSalesClaimJobs(agenda)
}

module.exports = {
  defineSalesJobs
}

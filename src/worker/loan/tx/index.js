const { defineTxEthJobs } = require('./eth')

function defineTxJobs (agenda) {
  defineTxEthJobs(agenda)
}

module.exports = {
  defineTxJobs
}

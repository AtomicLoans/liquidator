const { defineNewAgentJobs } = require('./new')
const { defineAgentApproveJobs } = require('./approve')

function defineAgentJobs (agenda) {
  defineNewAgentJobs(agenda)
  defineAgentApproveJobs(agenda)
}

module.exports = {
  defineAgentJobs
}

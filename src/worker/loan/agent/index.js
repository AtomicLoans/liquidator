const { defineNewAgentJobs } = require('./new')
const { defineAgentStatusJobs } = require('./status')
const { defineAgentApproveJobs } = require('./approve')

function defineAgentJobs (agenda) {
  defineNewAgentJobs(agenda)
  defineAgentStatusJobs(agenda)
  defineAgentApproveJobs(agenda)
}

module.exports = {
  defineAgentJobs
}

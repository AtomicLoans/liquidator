const { defineAgentApproveJobs } = require('./approve')

function defineAgentJobs (agenda) {
  defineAgentApproveJobs(agenda)
}

module.exports = {
  defineAgentJobs
}

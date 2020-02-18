const bugsnag = require('@bugsnag/js')
const bugsnagClient = bugsnag(process.env.BUGSNAG_API)
const { getAgentUrl } = require('./url')

function handleError (e) {
  const agentUrl = getAgentUrl()

  bugsnagClient.metaData = {
    agentUrl
  }

  bugsnagClient.notify(e)
}

module.exports = handleError

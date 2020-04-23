const bugsnag = require('@bugsnag/js')
const { getAgentUrl } = require('./url')

let bugsnagClient
if (process.env.BUGSNAG_API) {
  bugsnagClient = bugsnag(process.env.BUGSNAG_API)
} else {
  bugsnagClient = {}
  bugsnagClient.notify = function (e) {
    console.log('notify', e)
  }
}

function handleError (e) {
  const agentUrl = getAgentUrl()

  bugsnagClient.metaData = {
    agentUrl
  }

  bugsnagClient.notify(e)
}

module.exports = handleError

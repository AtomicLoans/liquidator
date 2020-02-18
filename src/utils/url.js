const { getEndpoint } = require('./endpoints')

const { NETWORK, HEROKU_APP, PARTY, AL_APP, AGENT_URL } = process.env

function getAgentUrl () {
  if (PARTY === 'arbiter') {
    return getEndpoint('ARBITER_ENDPOINT')
  } else if (NETWORK === 'test') {
    return getEndpoint('LENDER_ENDPOINT')
  } else if (HEROKU_APP !== undefined && HEROKU_APP !== 'undefined') {
    return `https://${HEROKU_APP}.herokuapp.com/api/loan`
  } else if (AL_APP === 'true') {
    return 'https://atomicloans.io/lender-agent/api/loan/'
  } else {
    return `${AGENT_URL}/api/loan/`
  }

  // TODO: should be able to specify agent url
}

module.exports = {
  getAgentUrl
}

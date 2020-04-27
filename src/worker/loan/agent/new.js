const axios = require('axios')

const { getEndpoint } = require('../../../utils/endpoints')
const LoanMarket = require('../../../models/LoanMarket')

const { NETWORK, HEROKU_APP, AL_APP, AGENT_URL } = process.env

function defineNewAgentJobs (agenda) {
  agenda.define('notify-arbiter', async (job, done) => {
    const loanMarkets = await LoanMarket.find().exec()
    const loanMarket = loanMarkets[0]

    const { collateralPublicKey, principalAddress } = await loanMarket.getAgentAddresses()

    // TODO add logic that only notifies arbiter if heroku app

    let url
    if (NETWORK === 'test') {
      url = getEndpoint('LENDER_ENDPOINT')
    } else if (HEROKU_APP !== undefined && HEROKU_APP !== 'undefined') {
      url = `https://${HEROKU_APP}.herokuapp.com/api/loan`
    } else if (AL_APP === 'true') {
      url = 'https://atomicloans.io/lender-agent/api/loan'
    } else {
      url = `${AGENT_URL}/api/loan`
    }

    console.log('notify-arbiter')

    const ethSigner = process.env.METAMASK_ETH_ADDRESS

    await axios.post(`${getEndpoint('ARBITER_ENDPOINT')}/liquidators/new`, { collateralPublicKey, principalAddress, ethSigner, url })
    // TODO: verify that this was done correctly, and create an endpoint for checking this

    done()
  })
}

module.exports = {
  defineNewAgentJobs
}

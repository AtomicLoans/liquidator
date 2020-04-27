const axios = require('axios')

const { getEndpoint } = require('../../../utils/endpoints')
const LoanMarket = require('../../../models/LoanMarket')

const { NETWORK, HEROKU_APP } = process.env

function defineNewAgentJobs (agenda) {
  agenda.define('notify-arbiter', async (job, done) => {
    const loanMarkets = await LoanMarket.find().exec()
    const loanMarket = loanMarkets[0]

    const { collateralPublicKey, principalAddress } = await loanMarket.getAgentAddresses()

    let url
    if (NETWORK === 'test') {
      url = getEndpoint('LIQUIDATOR_ENDPOINT')
    } else if (HEROKU_APP !== undefined && HEROKU_APP !== 'undefined') {
      url = `https://${HEROKU_APP}.herokuapp.com/api/loan`
    } else {
      done()
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

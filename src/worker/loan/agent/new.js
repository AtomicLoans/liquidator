const axios = require('axios')

const { getEndpoint } = require('../../../utils/endpoints')
const LoanMarket = require('../../../models/LoanMarket')
const AgendaJob = require('../../../models/AgendaJob')

const web3 = require('../../../utils/web3')
const { getInterval } = require('../../../utils/intervals')

const { NETWORK, HEROKU_APP } = process.env

function defineNewAgentJobs (agenda) {
  agenda.define('notify-arbiter', async (job, done) => {
    const loanMarkets = await LoanMarket.find().exec()
    const loanMarket = loanMarkets[0]

    const {
      collateralPublicKey,
      principalAddress
    } = await loanMarket.getAgentAddresses()

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

    const timestamp = Math.floor(new Date().getTime() / 1000)
    const message = `Register new liquidator (${principalAddress} ${collateralPublicKey} ${ethSigner} ${url}) ${timestamp}`
    const signature = await web3().eth.personal.sign(
      message,
      (await web3().currentProvider.getAddresses())[0]
    )

    try {
      console.log('posting...')
      await axios.post(`${getEndpoint('ARBITER_ENDPOINT')}/liquidators/new`, {
        collateralPublicKey,
        principalAddress,
        ethSigner,
        url,
        signature,
        timestamp
      })
      done()
    } catch (e) {
      console.log('`notify-arbiter` failed. Retrying...')
      const alreadyQueuedJobs = await AgendaJob.find({ name: 'notify-arbiter', nextRunAt: { $ne: null } }).exec()

      if (alreadyQueuedJobs.length <= 0) {
        await agenda.schedule(getInterval('ACTION_INTERVAL'), 'notify-arbiter')
      }
      console.log(e)
      done(e)
    }

    done()
  })
}

module.exports = {
  defineNewAgentJobs
}

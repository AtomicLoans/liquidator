const asyncHandler = require('express-async-handler')
const { contractAddresses } = require('../../../networks/index')

const addresses = contractAddresses(process.env.NETWORK)

function defineNetworkRoutes (router) {
  router.get('/network', asyncHandler(async (req, res) => {
    res.json(addresses)
  }))
}

module.exports = defineNetworkRoutes

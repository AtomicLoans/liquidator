const asyncHandler = require('express-async-handler')
const EthTx = require('../../../models/EthTx')

function defineTxsRouter (router) {
  router.get('/txs', asyncHandler(async (req, res) => {
    const result = await EthTx.find().exec()

    res.json(result.map(r => r.json()))
  }))
}

module.exports = defineTxsRouter

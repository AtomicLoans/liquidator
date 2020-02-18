const asyncHandler = require('express-async-handler')
const { verifySignature } = require('../../../utils/signatures')
const { getEthSigner } = require('../../../utils/address')

function defineResetRouter (router) {
  router.post('/reset', asyncHandler(async (req, res, next) => {
    const agenda = req.app.get('agenda')
    const currentTime = Math.floor(new Date().getTime() / 1000)
    const address = getEthSigner()

    const { body } = req
    const { signature, message, timestamp } = body

    console.log('signature, message, timestamp', signature, message, timestamp)

    if (!verifySignature(signature, message, address)) return next(res.createError(401, 'Signature doesn\'t match address'))
    if (!(message === `Reset transactions at ${timestamp}`)) return next(res.createError(401, 'Message doesn\'t match params'))
    if (!(currentTime <= (timestamp + 60))) return next(res.createError(401, 'Signature is stale'))

    await agenda.now('sanitize-eth-txs', { timePeriod: 0 })

    res.json({ message: 'success' })
  }))
}

module.exports = defineResetRouter

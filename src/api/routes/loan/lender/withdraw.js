const asyncHandler = require('express-async-handler')
const BN = require('bignumber.js')
const { verifySignature } = require('../../../../utils/signatures')
const clients = require('../../../../utils/clients')
const { currencies } = require('../../../../utils/fx')
const { getEthSigner } = require('../../../../utils/address')

function defineWithdrawRoutes (router) {
  router.post('/withdraw', asyncHandler(async (req, res, next) => {
    const currentTime = Math.floor(new Date().getTime() / 1000)
    const address = getEthSigner()

    const { body } = req
    const { signature, message, amount, timestamp, currency } = body

    if (!verifySignature(signature, message, address)) return next(res.createError(401, 'Signature doesn\'t match address'))
    if (!(message === `Withdraw ${amount} ${currency} to ${address} at ${timestamp}`)) return next(res.createError(401, 'Message doesn\'t match params'))
    if (!(currentTime <= (timestamp + 60))) return next(res.createError(401, 'Signature is stale'))

    const toAmount = BN(amount).times(currencies[currency].multiplier).toFixed()

    const withdrawHash = await clients[currency].chain.sendTransaction(address, toAmount)

    res.json({ withdrawHash })
  }))
}

module.exports = defineWithdrawRoutes

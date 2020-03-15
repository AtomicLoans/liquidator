const asyncHandler = require('express-async-handler')
const BN = require('bignumber.js')
const { verifySignature } = require('../../../../utils/signatures')
const clients = require('../../../../utils/clients')
const { currencies } = require('../../../../utils/fx')
const { getEthSigner } = require('../../../../utils/address')
const LoanMarket = require('../../../../models/LoanMarket')
const Withdraw = require('../../../../models/Withdraw')
const { setTxParams, bumpTxFee, sendTransaction } = require('../../../../worker/loan/utils/web3Transaction')
const { getInterval } = require('../../../../utils/intervals')
const handleError = require('../../../../utils/handleError')
const { sleep } = require('@liquality/utils')
const { getObject, getContract } = require('../../../../utils/contracts')

function defineWithdrawRoutes (router) {
  router.post('/withdraw', asyncHandler(async (req, res, next) => {
    const agenda = req.app.get('agenda')
    const currentTime = Math.floor(new Date().getTime() / 1000)
    const address = getEthSigner()

    const { body } = req
    const { signature, message, amount, timestamp, currency } = body

    let withdrawAddress
    if (body.withdrawAddress) {
      withdrawAddress = body.withdrawAddress
    } else {
      withdrawAddress = address
    }

    if (!verifySignature(signature, message, address)) return next(res.createError(401, 'Signature doesn\'t match address'))
    console.log('message', message)
    console.log(`Withdraw ${amount} ${currency} to ${withdrawAddress} at ${timestamp}`)
    if (!(message === `Withdraw ${amount} ${currency} to ${withdrawAddress} at ${timestamp}`)) return next(res.createError(401, 'Message doesn\'t match params'))
    if (!(currentTime <= (timestamp + 60))) return next(res.createError(401, 'Signature is stale'))

    const toAmount = BN(amount).times(currencies[currency].multiplier).toFixed()

    let withdrawHash
    if (currency === 'BTC') {
      withdrawHash = await clients[currency].chain.sendTransaction(withdrawAddress, currency === 'BTC' ? parseInt(toAmount) : toAmount)
    } else {
      const loanMarket = await LoanMarket.findOne({}).exec()
      const { principalAddress } = await loanMarket.getAgentAddresses()

      const withdrawModel = Withdraw.fromTxParams()
      await withdrawModel.save()

      if (currency === 'ETH') {
        const ethTx = await setTxParams('0x', principalAddress, withdrawAddress, withdrawModel)
        ethTx.value = toAmount
        await ethTx.save()

        withdrawModel.ethTxId = ethTx.id
        await withdrawModel.save()

        await sendTransaction(ethTx, withdrawModel, agenda, done, txSuccess, txFailure)
      } else {
        const token = getObject('erc20', currency)

        const txData = await token.methods.transfer(withdrawAddress, toAmount).encodeABI()
        const ethTx = await setTxParams(txData, principalAddress, getContract('erc20', currency), withdrawModel)
        await ethTx.save()

        withdrawModel.ethTxId = ethTx.id
        await withdrawModel.save()

        await sendTransaction(ethTx, withdrawModel, agenda, done, txSuccess, txFailure)


      }
    }

    res.json({ withdrawHash })
  }))
}

function done () {
  console.log('done')
}

async function txSuccess (transactionHash, ethTx, instance, agenda) {
  const withdraw = instance

  withdraw.ethTxId = ethTx.id
  withdraw.withdrawTxHash = transactionHash
  withdraw.status = 'WITHDRAWING'
  withdraw.save()
  console.log('WITHDRAWING')
  // await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-withdraw', { withdrawModelId: withdraw.id })
}

async function txFailure (error, instance) {
  console.log('WITHDRAWING FAILED')

  const withdraw = instance

  withdraw.status = 'FAILED'
  await withdraw.save()

  handleError(error)
}

module.exports = defineWithdrawRoutes

const asyncHandler = require('express-async-handler')
const BN = require('bignumber.js')
const { ensure0x, checksumEncode } = require('@liquality/ethereum-utils')
const { verifySignature } = require('../../../../utils/signatures')
const clients = require('../../../../utils/clients')
const { getObject } = require('../../../../utils/contracts')
const { getEthSigner } = require('../../../../utils/address')
const { getInterval } = require('../../../../utils/intervals')
const { numToBytes32 } = require('../../../../utils/finance')
const web3 = require('web3')
const { fromWei, hexToAscii } = web3.utils

const LoanMarket = require('../../../../models/LoanMarket')
const Market = require('../../../../models/Market')
const Fund = require('../../../../models/Fund')
const Loan = require('../../../../models/Loan')
const EthTx = require('../../../../models/EthTx')

function defineLoansRouter (router) {
  router.post('/loans/new', asyncHandler(async (req, res, next) => {
    console.log('start /loans/new')
    const { body } = req
    const { principal, collateral, principalAmount } = body
    const { loanMarket, market, fund } = await findModels(res, next, principal, collateral)
    const { rate } = market
    const { fundId } = fund

    const funds = getObject('funds', principal)
    const liquidationRatio = await funds.methods.liquidationRatio(numToBytes32(fundId)).call()
    const minimumCollateralAmount = BN(principalAmount).dividedBy(rate).times(fromWei(liquidationRatio, 'gether')).toFixed(8)

    const loan = Loan.fromLoanMarket(loanMarket, body, minimumCollateralAmount)

    await loan.setAgentAddresses()
    await loan.save()

    console.log('end /loans/new')

    res.json(loan.json())
  }))

  router.get('/loans/:loanModelId', asyncHandler(async (req, res, next) => {
    const { params } = req

    const loan = await Loan.findOne({ _id: params.loanModelId }).exec()
    if (!loan) return next(res.createError(401, 'Loan not found'))

    res.json(loan.json())
  }))

  router.get('/loans', asyncHandler(async (req, res) => {
    const result = await Loan.find().exec()

    res.json(result.map(r => r.json()))
  }))

  router.get('/loans/contract/:principal/:loanId', asyncHandler(async (req, res, next) => {
    const { params } = req
    const { principal, loanId } = params

    const loan = await Loan.findOne({ principal, loanId }).exec()
    if (!loan) return next(res.createError(401, 'Loan not found'))

    res.json(loan.json())
  }))

  router.post('/loans/:loanModelId/proof_of_funds', asyncHandler(async (req, res, next) => {
    console.log('start /loans/:loanModelId/proof_of_funds')

    try {
      const currentTime = Date.now()
      const agenda = req.app.get('agenda')
      const { params, body } = req
      const { proofOfFundsTxHex } = body

      const loan = await Loan.findOne({ _id: params.loanModelId }).exec()
      if (!loan) return next(res.createError(401, 'Loan not found'))
      const {
        collateral, principalAmount, minimumCollateralAmount, requestExpiresAt, requestCreatedAt
      } = loan

      ;['borrowerSecretHashes', 'borrowerCollateralPublicKey', 'borrowerPrincipalAddress'].forEach(key => {
        if (!body[key]) return next(res.createError(401, `${key} is missing`))
        loan[key] = body[key]
      })
      const { borrowerPrincipalAddress } = loan

      const proofOfFundsTxValid = (await clients[collateral].getMethod('jsonrpc')('testmempoolaccept', [proofOfFundsTxHex]))[0].allowed
      if (!proofOfFundsTxValid) return next(res.createError(401, 'Proof of funds tx not valid'))

      const rawTx = await clients[collateral].getMethod('jsonrpc')('decoderawtransaction', proofOfFundsTxHex)

      const { value: collateralAmount } = rawTx.vout[0]
      if (!(collateralAmount >= minimumCollateralAmount)) return next(res.createError(401, `Proof of funds for ${minimumCollateralAmount} ${collateral} not provided`))

      const [, msgHex] = rawTx.vout[1].scriptPubKey.asm.split(' ')
      const msg = hexToAscii(ensure0x(msgHex))

      const [principalAddress, amount, timestamp] = msg.split(' ')

      console.log('principalAddress', principalAddress)
      console.log('borrowerPrincipalAddress', borrowerPrincipalAddress)
      if (!(checksumEncode(principalAddress) === checksumEncode(borrowerPrincipalAddress))) return next(res.createError(401, 'Proof of funds ethAddress does not match borrower principal address'))
      if (!(parseFloat(amount) === principalAmount)) return next(res.createError(401, 'Amount provided in signature does not match proof of funds'))
      if (!(requestExpiresAt >= timestamp && timestamp >= requestCreatedAt)) return next(res.createError(401, 'Proof of funds tx incorrect timestamp'))
      if (!(requestExpiresAt >= currentTime && currentTime >= requestCreatedAt)) return next(res.createError(401, 'Request details provided too late. Please request again'))

      await loan.setSecretHashes(collateralAmount)

      await loan.save()

      await agenda.schedule(getInterval('ACTION_INTERVAL'), 'request-loan', { loanModelId: loan.id })

      console.log('end /loans/:loanModelId/proof_of_funds')

      res.json(loan.json())
    } catch (e) {
      console.log(e)
      return next(res.createError(401, e))
    }
  }))

  router.post('/loans/:loanModelId/collateral_locked', asyncHandler(async (req, res, next) => {
    const { params } = req
    const agenda = req.app.get('agenda')

    const loan = await Loan.findOne({ _id: params.loanModelId }).exec()
    if (!loan) return next(res.createError(401, 'Loan not found'))

    const { principal, collateralRefundableP2SHAddress, collateralSeizableP2SHAddress, refundableCollateralAmount, seizableCollateralAmount } = loan

    const loans = getObject('loans', principal)
    const approved = await loans.methods.approved(numToBytes32(params.loanId)).call()

    if (approved) {
      res.json({ message: 'Loan was already approved', status: 1 })
    } else {
      const refundableBalance = await loan.collateralClient().chain.getBalance([collateralRefundableP2SHAddress])
      const seizableBalance = await loan.collateralClient().chain.getBalance([collateralSeizableP2SHAddress])

      const refundableUnspent = await loan.collateralClient().getMethod('getUnspentTransactions')([collateralRefundableP2SHAddress])
      const seizableUnspent = await loan.collateralClient().getMethod('getUnspentTransactions')([collateralSeizableP2SHAddress])

      const collateralRequirementsMet = (refundableBalance.toNumber() >= refundableCollateralAmount && seizableBalance.toNumber() >= seizableCollateralAmount)
      const refundableConfirmationRequirementsMet = refundableUnspent.length === 0 ? false : refundableUnspent[0].confirmations > 0
      const seizableConfirmationRequirementsMet = seizableUnspent.length === 0 ? false : seizableUnspent[0].confirmations > 0

      if (collateralRequirementsMet && refundableConfirmationRequirementsMet && seizableConfirmationRequirementsMet) {
        await agenda.now('approve-loan', { loanModelId: loan.id })

        res.json({ message: 'Approving Loan', status: 0 })
      } else {
        res.json({ message: 'Collateral has not be locked', status: 2 })
      }
    }
  }))

  router.post('/loans/:loanModelId/repaid', asyncHandler(async (req, res, next) => {
    const { params } = req
    const agenda = req.app.get('agenda')

    const loan = await Loan.findOne({ _id: params.loanModelId }).exec()
    if (!loan) return next(res.createError(401, 'Loan not found'))

    const { principal, loanId } = loan

    const loans = getObject('loans', principal)
    const { off, paid } = await loans.methods.bools(numToBytes32(loanId)).call()

    if (!off && paid) {
      await agenda.now('accept-loan', { loanModelId: loan.id })

      res.json({ message: 'Accepting Loan', status: 0 })
    } else if (!off & !paid) {
      res.json({ message: 'Loan hasn\'t been paid', status: 1 })
    } else {
      res.json({ message: 'Loan was already accepted or refunded', status: 2 })
    }
  }))

  router.post('/loans/cancel_all', asyncHandler(async (req, res, next) => {
    const agenda = req.app.get('agenda')
    const currentTime = Math.floor(new Date().getTime() / 1000)
    const address = getEthSigner()

    const { body } = req
    const { signature, message, timestamp } = body

    if (!verifySignature(signature, message, address)) return next(res.createError(401, 'Signature doesn\'t match address'))
    if (!(message === `Cancel all loans for ${address} at ${timestamp}`)) return next(res.createError(401, 'Message doesn\'t match params'))
    if (!(currentTime <= (timestamp + 60))) return next(res.createError(401, 'Signature is stale'))

    const requestedLoans = await Loan.find({ status: 'AWAITING_COLLATERAL' }).exec()

    for (const loan of requestedLoans) {
      await agenda.now('accept-or-cancel-loan', { loanModelId: loan.id })
    }

    res.json({ message: 'Cancelling loans', status: 0 })
  }))

  if (process.env.NODE_ENV === 'test') {
    router.post('/remove_loans', asyncHandler(async (req, res, next) => {
      await Loan.deleteMany()
      await EthTx.deleteMany()

      res.json({ message: 'Removed all loans' })
    }))
  }
}

async function findModels (res, next, principal, collateral) {
  const loanMarket = await LoanMarket.findOne({ principal, collateral }).exec()
  if (!loanMarket) return next(res.createError(401, 'Loan Market not found'))

  const market = await Market.findOne({ from: collateral, to: principal }).exec()
  if (!market) return next(res.createError(401, 'Market not found'))

  const fund = await Fund.findOne({ principal, collateral }).exec()
  if (!fund) return next(res.createError(401, 'Fund not found'))

  return { loanMarket, market, fund }
}

module.exports = defineLoansRouter

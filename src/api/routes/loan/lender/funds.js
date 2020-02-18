const _ = require('lodash')
const axios = require('axios')
const asyncHandler = require('express-async-handler')
const compareVersions = require('compare-versions')

const LoanMarket = require('../../../../models/LoanMarket')
const Fund = require('../../../../models/Fund')
const { verifySignature } = require('../../../../utils/signatures')
const { getInterval } = require('../../../../utils/intervals')
const { getEthSigner } = require('../../../../utils/address')
const { getEndpoint } = require('../../../../utils/endpoints')

function defineFundsRouter (router) {
  router.get('/funds/:fundModelId', asyncHandler(async (req, res, next) => {
    const { params } = req

    const fund = await Fund.findOne({ _id: params.fundModelId }).exec()
    if (!fund) return next(res.createError(401, 'Fund not found'))

    res.json(fund.json())
  }))

  router.get('/funds/ticker/:principal', asyncHandler(async (req, res, next) => {
    const { params } = req

    const fund = await Fund.findOne({ principal: params.principal.toUpperCase(), status: { $ne: 'FAILED' } }).exec()
    if (!fund) return next(res.createError(401, 'Fund not found'))

    res.json(fund.json())
  }))

  router.post('/funds/new', asyncHandler(async (req, res, next) => {
    console.log('start /funds/new')

    let fund
    const agenda = req.app.get('agenda')
    const address = getEthSigner()
    const { body } = req
    const { principal, collateral, custom, signature, message } = body

    // TODO: implement verify signature

    fund = await Fund.findOne({ principal, collateral, status: { $ne: 'FAILED' } }).exec()
    if (fund && fund.status === 'CREATED') return next(res.createError(401, 'Fund was already created. Agent can only have one Loan Fund'))

    const loanMarket = await LoanMarket.findOne(_.pick(body, ['principal', 'collateral'])).exec()
    if (!loanMarket) return next(res.createError(401, `LoanMarket not found with ${principal} principal and ${collateral} collateral`))

    if (custom) {
      // TODO: verify signature for custom funds

      fund = Fund.fromCustomFundParams(body)
    } else {
      const { maxLoanDuration, fundExpiry, compoundEnabled, amount } = body

      const expectMessage = `Create ${custom ? 'Custom' : 'Non-Custom'} ${principal} Loan Fund backed by ${collateral} with ${compoundEnabled ? 'Compound Enabled' : 'Compound Disabled'} and Maximum Loan Duration of ${maxLoanDuration} seconds which expires at timestamp ${fundExpiry} and deposit ${amount} ${principal}`

      if (!verifySignature(signature, message, address)) return next(res.createError(401, 'Signature doesn\'t match address'))
      if (!(message === expectMessage)) return next(res.createError(401, `Message doesn't match params (Expected Message: ${expectMessage}... Actual Message: ${message})`))

      fund = Fund.fromFundParams(body)
    }

    await fund.save()
    await agenda.schedule(getInterval('ACTION_INTERVAL'), 'create-fund-ish', { fundModelId: fund.id })

    console.log('end /funds/new')

    res.json(fund.json())
  }))

  router.post('/funds/:fundModelId/withdraw', asyncHandler(async (req, res, next) => {
    console.log('start /funds/:fundModelId/withdraw')

    const currentTime = Math.floor(new Date().getTime() / 1000)
    const agenda = req.app.get('agenda')
    const address = getEthSigner()
    const { params } = req
    const { body } = req
    const { amountToWithdraw, signature, message, timestamp } = body

    const fund = await Fund.findOne({ _id: params.fundModelId }).exec()
    if (!fund) return next(res.createError(401, 'Fund not found'))

    const { principal } = fund

    if (!verifySignature(signature, message, address)) return next(res.createError(401, 'Signature doesn\'t match address'))

    console.log('message', message)
    console.log(`Withdraw ${amountToWithdraw} ${principal} at ${timestamp}`)

    if (!(message === `Withdraw ${amountToWithdraw} ${principal} at ${timestamp}`)) return next(res.createError(401, 'Message doesn\'t match params'))
    if (!(currentTime <= (timestamp + 60))) return next(res.createError(401, 'Signature is stale'))

    await agenda.schedule(getInterval('ACTION_INTERVAL'), 'fund-withdraw', { fundModelId: fund.id, amountToWithdraw })

    console.log('end /funds/:fundModelId/withdraw')

    res.json(fund.json())
  }))

  router.post('/funds/contract/:fundId/withdraw', asyncHandler(async (req, res, next) => {
    console.log('start /funds/contract/:fundId/withdraw')

    const currentTime = Math.floor(new Date().getTime() / 1000)
    const agenda = req.app.get('agenda')
    const address = getEthSigner()
    const { params } = req
    const { body } = req
    const { amountToWithdraw, signature, message, timestamp } = body

    const fund = await Fund.findOne({ fundId: params.fundId }).exec()
    if (!fund) return next(res.createError(401, 'Fund not found'))

    const { principal } = fund

    if (!verifySignature(signature, message, address)) return next(res.createError(401, 'Signature doesn\'t match address'))

    console.log('message', message)
    console.log(`Withdraw ${amountToWithdraw} ${principal} at ${timestamp}`)

    if (!(message === `Withdraw ${amountToWithdraw} ${principal} at ${timestamp}`)) return next(res.createError(401, 'Message doesn\'t match params'))
    if (!(currentTime <= (timestamp + 60))) return next(res.createError(401, 'Signature is stale'))

    await agenda.schedule(getInterval('ACTION_INTERVAL'), 'fund-withdraw', { fundModelId: fund.id, amountToWithdraw })

    console.log('end /funds/contract/:fundId/withdraw')

    res.json(fund.json())
  }))

  router.post('/funds/contract/:principal/:fundId/withdraw', asyncHandler(async (req, res, next) => {
    console.log('start /funds/contract/:fundId/withdraw')

    const currentTime = Math.floor(new Date().getTime() / 1000)
    const agenda = req.app.get('agenda')
    const address = getEthSigner()
    const { params, body } = req
    const { amountToWithdraw, signature, message, timestamp } = body

    const fund = await Fund.findOne({ principal: params.principal, fundId: params.fundId }).exec()
    if (!fund) return next(res.createError(401, 'Fund not found'))

    const { principal } = fund

    if (!verifySignature(signature, message, address)) return next(res.createError(401, 'Signature doesn\'t match address'))

    console.log('message', message)
    console.log(`Withdraw ${amountToWithdraw} ${principal} at ${timestamp}`)

    if (!(message === `Withdraw ${amountToWithdraw} ${principal} at ${timestamp}`)) return next(res.createError(401, 'Message doesn\'t match params'))
    if (!(currentTime <= (timestamp + 60))) return next(res.createError(401, 'Signature is stale'))

    await agenda.schedule(getInterval('ACTION_INTERVAL'), 'fund-withdraw', { fundModelId: fund.id, amountToWithdraw })

    console.log('end /funds/contract/:fundId/withdraw')

    res.json(fund.json())
  }))

  router.post('/funds/contract/:principal/:fundId/deposit', asyncHandler(async (req, res, next) => {
    console.log('start /funds/contract/:fundId/deposit')

    const agenda = req.app.get('agenda')

    const { params, body } = req
    const { fundId, principal } = params
    const { ethTxId } = body

    const fund = await Fund.findOne({ principal, fundId }).exec()
    if (!fund) return next(res.createError(401, 'Fund not found'))

    await agenda.now('fund-lender-deposit', { principal, fundId, ethTxId })

    console.log('end /funds/contract/:fundId/deposit')

    res.json(fund.json())
  }))

  router.post('/funds/contract/:principal/:fundId/update', asyncHandler(async (req, res, next) => {
    console.log('start /funds/contract/:principal/:fundId/update')

    const currentTime = Math.floor(new Date().getTime() / 1000)
    const agenda = req.app.get('agenda')
    const address = getEthSigner()
    const { params, body } = req
    const { maxLoanDuration, fundExpiry, signature, message, timestamp } = body
    const { fundId, principal } = params

    const fund = await Fund.findOne({ fundId, principal }).exec()
    if (!fund) return next(res.createError(401, 'Fund not found'))

    if (!verifySignature(signature, message, address)) return next(res.createError(401, 'Signature doesn\'t match address'))
    if (!(message === `Update ${principal} Fund with maxLoanDuration: ${maxLoanDuration} and fundExpiry ${fundExpiry} at timestamp ${timestamp}`)) return next(res.createError(401, 'Message doesn\'t match params'))
    if (!(currentTime <= (timestamp + 60))) return next(res.createError(401, 'Signature is stale'))

    let safePrincipal = principal
    if (principal === 'SAI') {
      const { data: versionData } = await axios.get(`${getEndpoint('ARBITER_ENDPOINT')}/version`)
      const { version } = versionData

      if (!compareVersions(version, '0.1.31', '>')) {
        safePrincipal = 'DAI'
      }
    }

    const { status, data } = await axios.get(`${getEndpoint('ARBITER_ENDPOINT')}/agentinfo/ticker/${safePrincipal}/BTC`)

    if (status === 200) {
      const { principalAddress: arbiter } = data

      await agenda.schedule(getInterval('ACTION_INTERVAL'), 'fund-update', { fundModelId: fund.id, maxLoanDuration, fundExpiry, arbiter })

      console.log('end /funds/contract/:principal/:fundId/update')

      res.json(fund.json())
    } else {
      return next(res.createError(401, 'Arbiter down'))
    }
  }))

  if (process.env.NODE_ENV === 'test') {
    router.post('/remove_funds', asyncHandler(async (req, res, next) => {
      console.log('remove_funds')

      await Fund.deleteMany()

      res.json({ message: 'Removed all funds' })
    }))
  }
}

module.exports = defineFundsRouter

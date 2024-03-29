const axios = require('axios')
const BN = require('bignumber.js')
const { ensure0x } = require('@liquality/ethereum-utils')
const Approve = require('../../../models/Approve')
const Loan = require('../../../models/Loan')
const Sale = require('../../../models/Sale')
const LoanMarket = require('../../../models/LoanMarket')
const { numToBytes32 } = require('../../../utils/finance')
const { getCurrentTime } = require('../../../utils/time')
const { getObject, getContract } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { currencies } = require('../../../utils/fx')
const { getMedianBtcPrice } = require('../../../utils/getPrices')
const { getEndpoint } = require('../../../utils/endpoints')
const handleError = require('../../../utils/handleError')

const web3 = require('../../../utils/web3')
const { fromWei } = web3().utils

function defineLoanStatusJobs (agenda) {
  agenda.define('check-loan-statuses-and-update', async (_, done) => {
    console.log('check-loan-statuses-and-update')

    try {
      const loanMarkets = await LoanMarket.find().exec()

      for (let i = 0; i < loanMarkets.length; i++) {
        const loanMarket = loanMarkets[i]

        const { principalAddress } = await loanMarket.getAgentAddresses()
        const ethBalance = await web3().eth.getBalance(principalAddress)

        if (ethBalance > 0) {
          const medianBtcPrice = await getMedianBtcPrice()
          await approveTokens(loanMarket, agenda)
          await checkLoans(loanMarket, agenda, medianBtcPrice)
          await checkSales(loanMarket, agenda, medianBtcPrice)
        }
      }

      done()
    } catch (e) {
      console.log(`Check Loan Statuses And Update Job ${e}`)
      handleError(e)
      done()
    }
  })
}

async function checkLoans (loanMarket, agenda, medianBtcPrice) {
  const { principal, collateral } = loanMarket

  const loans = getObject('loans', principal)
  const token = getObject('erc20', principal)

  const principalAddress = await (web3().currentProvider.getAddresses())[0]

  const currentTime = await getCurrentTime()

  const loanModels = await Loan.find({ principal, status: { $nin: ['QUOTE', 'REQUESTING', 'CANCELLING', 'CANCELLED', 'ACCEPTING', 'ACCEPTED', 'LIQUIDATING', 'LIQUIDATED', 'FAILED'] } }).exec()

  for (let i = 0; i < loanModels.length; i++) {
    const loanModel = loanModels[i]

    const { loanId, collateralRefundableP2SHAddress, collateralSeizableP2SHAddress } = loanModel

    const { off, sale } = await loans.methods.bools(numToBytes32(loanId)).call()
    const { loanExpiration } = await loans.methods.loans(numToBytes32(loanId)).call()

    if (!off && !sale) {
      const collateralBalance = await loanModel.collateralClient().chain.getBalance([collateralRefundableP2SHAddress, collateralSeizableP2SHAddress])

      console.log('Loan ID', loanId)
      const collateralValue = BN(collateralBalance).dividedBy(currencies[collateral].multiplier).times(medianBtcPrice).toFixed()
      console.log('collateralValue', collateralValue)

      const minCollateralValueInUnits = await loans.methods.minCollateralValue(numToBytes32(loanId)).call()
      console.log('minCollateralValueInUnits', minCollateralValueInUnits)
      const minCollateralValue = fromWei(minCollateralValueInUnits, 'ether')
      console.log('minCollateralValue', minCollateralValue)

      const discountCollateralValue = await loans.methods.ddiv(await loans.methods.discountCollateralValue(numToBytes32(loanId)).call()).call()
      console.log('discountCollateralValue', discountCollateralValue)

      const tokenBalance = await token.methods.balanceOf(principalAddress).call()
      console.log('tokenBalance', tokenBalance)

      if (BN(tokenBalance).gte(discountCollateralValue)) {
        if (currentTime > loanExpiration) {
          console.log('DEFAULTED')

          loanModel.status = 'LIQUIDATING'
          await loanModel.save()

          agenda.now('liquidate-loan', { loanModelId: loanModel.id })
        } else if (BN(collateralValue).isLessThan(minCollateralValue)) {
          console.log('!SAFE')
          console.log('LIQUIDATE')

          const safe = await loans.methods.safe(numToBytes32(loanId)).call()

          console.log('safe', safe)

          if (safe) {
            // update oracles

            // agenda.now('check-liquidator-oracle')
          } else {
            loanModel.status = 'LIQUIDATING'
            await loanModel.save()

            agenda.now('liquidate-loan', { loanModelId: loanModel.id })
          }
        }
      }
    } else if (sale) {
      console.log('Loan ID', loanId)
      const currentTime = await getCurrentTime()

      const sales = getObject('sales', principal)

      const next = await sales.methods.next(numToBytes32(loanId)).call()
      const saleIndex = await sales.methods.saleIndexByLoan(numToBytes32(loanId), parseInt(next) - 1).call()
      const settlementExpiration = await sales.methods.settlementExpiration(saleIndex).call()

      console.log('parseInt(next)', parseInt(next))
      console.log('currentTime', currentTime)
      console.log('parseInt(settlementExpiration)', parseInt(settlementExpiration))
      console.log('parseInt(next) < 3 && currentTime > parseInt(settlementExpiration)', parseInt(next) < 3 && currentTime > parseInt(settlementExpiration))

      if (parseInt(next) < 3 && currentTime > parseInt(settlementExpiration)) {
        loanModel.status = 'LIQUIDATING'
        await loanModel.save()

        agenda.now('liquidate-loan', { loanModelId: loanModel.id })
      }

      // TODO: CHECK IF FIRST LIQUIDATION FAILED
    } else {
      loanModel.status = 'ACCEPTED'
      await loanModel.save()
    }
  }
}

async function checkSales (loanMarket, agenda, medianBtcPrice) {
  const { principal, collateral } = loanMarket

  const sales = getObject('sales', principal)

  const saleModels = await Sale.find({ principal, status: { $in: ['INITIATED', 'COLLATERAL_SENDING', 'COLLATERAL_SENT'] } }).exec()

  for (let i = 0; i < saleModels.length; i++) {
    const saleModel = saleModels[i]

    const { saleId, collateralSwapRefundableP2SHAddress, collateralSwapSeizableP2SHAddress } = saleModel

    // if (currentTime > settlementExpiration) {
    //   console.log('SHOULD REFUND')

    //   agenda.now('refund-sale', { saleModelId: saleModel.id })
    // } else {
    const collateralSwapBalance = await saleModel.collateralClient().chain.getBalance([collateralSwapRefundableP2SHAddress, collateralSwapSeizableP2SHAddress])

    console.log('saleId', saleId)
    console.log('collateralSwapBalance', BN(collateralSwapBalance).toFixed())

    const discountBuyInUnits = await sales.methods.discountBuy(numToBytes32(saleId)).call()
    const discountBuy = BN(discountBuyInUnits).dividedBy(currencies[principal].multiplier).toFixed()
    console.log('discountBuy', discountBuy)

    const collateralValue = BN(collateralSwapBalance).dividedBy(currencies[collateral].multiplier).times(medianBtcPrice).toFixed()
    console.log('collateralValue', collateralValue)

    // if (BN(collateralValue).isGreaterThan(discountBuy)) {
    console.log('SHOULD CLAIM COLLATERAL')

    try {
      if (process.env.NODE_ENV === 'test') {
        const initUtxos = await saleModel.collateralClient().getMethod('jsonrpc')('listunspent', 1, 999999, [collateralSwapRefundableP2SHAddress])
        if (initUtxos.length > 0) {
          const initUtxo = initUtxos[0]
          const { txid: initTxHash } = initUtxo

          const { secretB, secretC } = await sales.methods.secretHashes(numToBytes32(saleId)).call()

          console.log('initTxHash', initTxHash)
          console.log('secretB', secretB)
          console.log('secretC', secretC)

          saleModel.secretB = secretB
          saleModel.secretC = secretC
          saleModel.initTxHash = initTxHash
          saleModel.status = 'SECRETS_PROVIDED'

          await saleModel.save()

          agenda.now('claim-collateral', { saleModelId: saleModel.id })
        }
      } else {
        // check arbiter / lender agent endpoint

        const { data: unfilteredAgents } = await axios.get(
              `${getEndpoint('ARBITER_ENDPOINT')}/agents`
        )

        const { lender: lenderPrincipalAddress } = await sales.methods.sales(numToBytes32(saleId)).call()

        const agents = unfilteredAgents.filter(
          agent => agent.principalAddress === ensure0x(lenderPrincipalAddress) && agent.status === 'ACTIVE'
        )
        const lenderUrl = agents[0].url

        const {
          data: { secretB }
        } = await axios.get(`${lenderUrl}/sales/contract/${principal}/${saleId}`)
        console.log(`${lenderUrl}/sales/contract/${principal}/${saleId}`)
        const {
          data: { secretC, initTxHash }
        } = await axios.get(
              `${getEndpoint('ARBITER_ENDPOINT')}/sales/contract/${principal}/${saleId}`
        )
        console.log(`${getEndpoint('ARBITER_ENDPOINT')}/sales/contract/${principal}/${saleId}`)

        console.log('initTxHash', initTxHash)
        console.log('secretB', secretB)
        console.log('secretC', secretC)

        if (secretB && secretC && initTxHash) {
          saleModel.secretB = secretB
          saleModel.secretC = secretC
          saleModel.initTxHash = initTxHash
          saleModel.status = 'SECRETS_PROVIDED'

          await saleModel.save()

          agenda.now('claim-collateral', { saleModelId: saleModel.id })
        } else {
          saleModel.status = 'COLLATERAL_SENT'

          await saleModel.save()
        }
      }
    } catch (e) {
      console.log(`Check Sales Error: ${e}`)
      handleError(e)
    }
  }
}

async function approveTokens (loanMarket, agenda) {
  const { principalAddress } = await loanMarket.getAgentAddresses()
  const { principal } = loanMarket

  const token = getObject('erc20', principal)
  const loansAddress = getContract('loans', principal)

  const allowance = await token.methods.allowance(principalAddress, loansAddress).call()
  const approve = await Approve.findOne({ principal, status: { $nin: ['FAILED'] } }).exec()

  if (parseInt(allowance) === 0 || !approve) {
    await agenda.schedule(getInterval('ACTION_INTERVAL'), 'approve-tokens', { loanMarketModelId: loanMarket.id })
  }
}

module.exports = {
  defineLoanStatusJobs
}

const axios = require('axios')
const BN = require('bignumber.js')
const compareVersions = require('compare-versions')
const Agent = require('../../../models/Agent')
const AgentFund = require('../../../models/AgentFund')
const { getObject } = require('../../../utils/contracts')
const { currencies } = require('../../../utils/fx')
const { getCurrentTime } = require('../../../utils/time')
const handleError = require('../../../utils/handleError')
const web3 = require('../../../utils/web3')
const { fromWei, hexToNumber } = web3().utils

function defineAgentStatusJobs (agenda) {
  agenda.define('check-lender-status', async (job, done) => {
    const agents = await Agent.find().exec()

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i]
      await agenda.now('check-agent', { agentModelId: agent.id })
    }

    done()
  })

  agenda.define('check-agent', async (job, done) => {
    const { data } = job.attrs
    const { agentModelId } = data

    const agent = await Agent.findOne({ _id: agentModelId }).exec()

    let lenderStatus, loanMarkets, agentVersion, versionStatus
    try {
      const { data: versionData, status: versionStatusInternal } = await axios.get(`${agent.url}/version`)
      const { version } = versionData
      agentVersion = version
      versionStatus = versionStatusInternal

      const { status, data } = await axios.get(`${agent.url}/loanmarketinfo`)

      console.log(`${agent.url} status:`, status)

      loanMarkets = data

      if (!(loanMarkets.length > 0)) {
        throw Error('Loan Markets not set')
      }

      lenderStatus = status
    } catch (e) {
      console.log(`Agent ${agent.url} not active`)
      lenderStatus = 401
    }

    if (lenderStatus === 200) {
      try {
        if (versionStatus === 200) {
          agent.version = agentVersion
        }
      } catch (e) {
        handleError(e)
      }

      agent.status = 'ACTIVE'

      // get agent principal address, and check if a fund exists for each loanmarket, if a fund does exist, update the balance

      try {
        for (let i = 0; i < loanMarkets.length; i++) {
          const loanMarket = loanMarkets[i]
          let { principal, collateral } = loanMarket
          if (compareVersions.compare(agentVersion, '0.1.31', '<')) {
            if (principal === 'DAI') {
              principal = 'SAI'
            }
          }
          const multiplier = currencies[principal].multiplier
          const decimals = currencies[principal].decimals

          const { data: { principalAddress, collateralPublicKey } } = await axios.get(`${agent.url}/agentinfo/${loanMarket.id}`)

          agent.principalAddress = principalAddress
          agent.collateralPublicKey = collateralPublicKey

          const ethBalance = await web3().eth.getBalance(principalAddress)
          agent.ethBalance = fromWei(ethBalance.toString(), 'ether')

          const funds = getObject('funds', principal)
          const loans = getObject('loans', principal)
          const sales = getObject('sales', principal)

          const fundId = await funds.methods.fundOwner(principalAddress).call()
          const marketLiquidity = await funds.methods.balance(fundId).call()

          const currentTime = await getCurrentTime()
          const { maxLoanDur, fundExpiry } = await funds.methods.funds(fundId).call()
          const maxLoanLengthTimestamp = BN.min(fundExpiry, BN(currentTime).plus(maxLoanDur)).toFixed()

          let borrowed = 0
          const lenderLoanCount = await loans.methods.lenderLoanCount(principalAddress).call()
          for (let j = 0; j < lenderLoanCount; j++) {
            const loanId = await loans.methods.lenderLoans(principalAddress, j).call()
            const loanPrincipal = await loans.methods.principal(loanId).call()
            const { sale: loanSale, off: loanOff } = await loans.methods.bools(loanId).call()
            if (loanSale) {
              const next = await sales.methods.next(loanId).call()
              const saleIndexByLoan = next - 1
              const saleId = await sales.methods.saleIndexByLoan(loanId, saleIndexByLoan).call()
              const { accepted: saleAccepted } = await sales.methods.sales(saleId).call()

              if (!saleAccepted) {
                borrowed = BN(borrowed).plus(loanPrincipal)
              }
            } else if (!loanOff) {
              borrowed = BN(borrowed).plus(loanPrincipal)
            }
          }

          const supplied = BN(borrowed).plus(marketLiquidity)
          const utilizationRatio = supplied.toNumber() === 0 ? 0 : BN(borrowed).dividedBy(supplied).toFixed(4)

          const marketLiquidityFormatted = BN(marketLiquidity).dividedBy(multiplier).toFixed(decimals)
          const borrowedFormatted = BN(borrowed).dividedBy(multiplier).toFixed(decimals)
          const suppliedFormatted = BN(supplied).dividedBy(multiplier).toFixed(decimals)

          const agentFund = await AgentFund.findOne({ principal, collateral, principalAddress }).exec()
          if (agentFund) {
            agentFund.utilizationRatio = utilizationRatio
            agentFund.marketLiquidity = marketLiquidityFormatted
            agentFund.borrowed = borrowedFormatted
            agentFund.supplied = suppliedFormatted
            agentFund.fundId = hexToNumber(fundId)
            agentFund.url = agent.url
            agentFund.maxLoanLengthTimestamp = maxLoanLengthTimestamp
            agentFund.ethBalance = fromWei(ethBalance.toString(), 'ether')
            agentFund.status = 'ACTIVE'
            await agentFund.save()
          } else {
            const params = {
              principal,
              collateral,
              principalAddress,
              utilizationRatio,
              fundId: hexToNumber(fundId),
              url: agent.url,
              ethBalance: fromWei(ethBalance.toString(), 'ether'),
              marketLiquidity: marketLiquidityFormatted,
              borrowed: borrowedFormatted,
              supplied: suppliedFormatted,
              maxLoanLengthTimestamp
            }
            const newAgentFund = AgentFund.fromAgentFundParams(params)
            await newAgentFund.save()
          }
        }
      } catch (e) {
        handleError(e)
      }
    } else {
      agent.status = 'INACTIVE'

      const agentFunds = await AgentFund.find({ principalAddress: agent.principalAddress }).exec()

      for (let i = 0; i < agentFunds.length; i++) {
        const agentFund = agentFunds[i]
        agentFund.status = 'INACTIVE'
        await agentFund.save()
      }
    }
    await agent.save()

    done()
  })
}

module.exports = {
  defineAgentStatusJobs
}

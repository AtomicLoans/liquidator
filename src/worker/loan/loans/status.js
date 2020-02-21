const axios = require('axios')
const BN = require('bignumber.js')
const { remove0x } = require('@liquality/ethereum-utils')
const { sha256 } = require('@liquality/crypto')
const compareVersions = require('compare-versions')
const Agent = require('../../../models/Agent')
const Approve = require('../../../models/Approve')
const Fund = require('../../../models/Fund')
const Loan = require('../../../models/Loan')
const Sale = require('../../../models/Sale')
const LoanMarket = require('../../../models/LoanMarket')
const Market = require('../../../models/Market')
const Deposit = require('../../../models/Deposit')
const { numToBytes32 } = require('../../../utils/finance')
const { getCurrentTime } = require('../../../utils/time')
const { getObject, getContract } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { isArbiter } = require('../../../utils/env')
const { currencies } = require('../../../utils/fx')
const { getEndpoint } = require('../../../utils/endpoints')
const { getLockArgs, getCollateralAmounts, isCollateralRequirementsSatisfied } = require('../utils/collateral')
const getMailer = require('../utils/mailer')
const handleError = require('../../../utils/handleError')

const web3 = require('../../../utils/web3')
const { hexToNumber, fromWei } = web3().utils

function defineLoanStatusJobs (agenda) {
  const mailer = getMailer(agenda)
  agenda.define('check-loan-statuses-and-update', async (job, done) => {
    console.log('check-loan-statuses-and-update')

    try {
      const loanMarkets = await LoanMarket.find().exec()

      for (let i = 0; i < loanMarkets.length; i++) {
        const loanMarket = loanMarkets[i]

        const { principalAddress } = await loanMarket.getAgentAddresses()
        const ethBalance = await web3().eth.getBalance(principalAddress)

        if (ethBalance > 0) {
          await approveTokens(loanMarket, agenda)

          const { principal } = loanMarket

          const loans = getObject('loans', principal)
          const token = getObject('erc20', principal)

          const loanCount = await loans.methods.loanIndex().call()

          const loanModels = await Loan.find({ principal, status: { $nin: ['QUOTE', 'REQUESTING', 'CANCELLING', 'CANCELLED', 'ACCEPTING', 'ACCEPTED', 'LIQUIDATED', 'FAILED'] } })

          for (let i = 0; i < loanModels.length; i++) {
            const loanModel = loanModels[i]

            const { loanId, collateralRefundableP2SHAddress, collateralSeizableP2SHAddress } = loanModel

            const { off, sale } = await loans.methods.bools(numToBytes32(loanId)).call()

            if (!off && !sale) {

              const collateralBalance = await loanModel.collateralClient().chain.getBalance([collateralRefundableP2SHAddress, collateralSeizableP2SHAddress])

              console.log('collateralBalance', BN(collateralBalance).toFixed())

            } else {
              loanModel.status = 'ACCEPTED'
              await loanModel.save()
            }
          }

          // for (let i = 0; i < loanCount; i++) {
          //   const { off, sale } = await loans.methods.bools(numToBytes32(i)).call()

          //   if (!off && !sale) {
          //     const safe = await loans.methods.safe(numToBytes32(i)).call()

          //     if (!safe) {
          //       const discountBuy = await loans.methods.discountCollateralValue(numToBytes32(i)).call()

          //       const balance = await token.methods.balanceOf(principalAddress).call()

          //       if (BN(balance).isGreaterThanOrEqualTo(discountBuy)) {
          //         // liquidate
          //         console.log('balance is enough to liquidate')

          //         // agenda.now('liquidate', { loanId: i })
          //       }
          //     }
          //   }
          // }
        }
      }

      done()
    } catch (e) {
      handleError(e)
      console.log('ERROR')
      console.log(e)
      done()
    }
  })
}

async function repopulateLoans (loanMarket, principal, principalAddress, collateral, lenderLoanCount, loans, sales) {
  console.log('Repopulate Loans')
  const decimals = currencies[principal].decimals
  const multiplier = currencies[principal].multiplier
  for (let i = 0; i < lenderLoanCount; i++) {
    const loanIdBytes32 = await loans.methods.lenderLoans(principalAddress, i).call()
    const loanId = hexToNumber(loanIdBytes32)

    const { borrower, principal: principalAmount, createdAt, loanExpiration, requestTimestamp } = await loans.methods.loans(numToBytes32(loanId)).call()
    const collateralAmount = await loans.methods.collateral(numToBytes32(loanId)).call()
    const minCollateralAmount = BN(collateralAmount).dividedBy(currencies[collateral].multiplier).toFixed(currencies[collateral].decimals)

    const params = { principal, collateral, principalAmount: BN(principalAmount).dividedBy(multiplier).toFixed(decimals), requestLoanDuration: loanExpiration - createdAt }

    const loanExists = await Loan.findOne({ principal, loanId }).exec()

    if (!loanExists) {
      await repopulateLoan(loanMarket, params, minCollateralAmount, loanId, requestTimestamp, loans, borrower, collateral, principal, sales)
    }
  }
}

async function repopulateLoan (loanMarket, params, minCollateralAmount, loanId, requestTimestamp, loans, borrower, collateral, principal, sales) {
  const loan = Loan.fromLoanMarket(loanMarket, params, minCollateralAmount)
  loan.loanId = loanId
  loan.requestCreatedAt = requestTimestamp

  await loan.setAgentAddresses()
  const { borrowerPubKey, lenderPubKey } = await loans.methods.pubKeys(numToBytes32(loanId)).call()

  loan.borrowerPrincipalAddress = borrower
  loan.borrowerCollateralPublicKey = remove0x(borrowerPubKey)
  loan.lenderCollateralPublicKey = remove0x(lenderPubKey)

  await loan.setSecretHashes(minCollateralAmount)
  const market = await Market.findOne({ from: collateral, to: principal }).exec()
  const { rate } = market
  const lockArgs = await getLockArgs(numToBytes32(loanId), principal, collateral)
  const addresses = await loan.collateralClient().loan.collateral.getLockAddresses(...lockArgs)
  const amounts = await getCollateralAmounts(numToBytes32(loanId), loan, rate)

  loan.setCollateralAddressValues(addresses, amounts)
  const { approved, withdrawn, sale, paid, off } = await loans.methods.bools(numToBytes32(loanId)).call()
  let saleModel
  if (off && withdrawn) {
    loan.status = 'ACCEPTED'
  } else if (off && !withdrawn) {
    loan.status = 'CANCELLED'
  } else if (sale) {
    loan.status = 'WITHDRAWN'
    // TODO: add Sale records
    const next = await sales.methods.next(numToBytes32(loanId)).call()
    const saleIndexByLoan = next - 1
    const saleIdBytes32 = await sales.methods.saleIndexByLoan(numToBytes32(loanId), saleIndexByLoan).call()
    const saleId = hexToNumber(saleIdBytes32)
    let safePrincipal = principal
    if (principal === 'SAI') {
      const { data: versionData } = await axios.get(`${getEndpoint('ARBITER_ENDPOINT')}/version`)
      const { version } = versionData
      if (!compareVersions(version, '0.1.31', '>')) {
        safePrincipal = 'DAI'
      }
    }
    const { data: arbiterSale } = await axios.get(`${getEndpoint('ARBITER_ENDPOINT')}/sales/contract/${safePrincipal}/${saleId}`)
    saleModel = new Sale(arbiterSale)
    const { collateralRefundableP2SHAddress, collateralSeizableP2SHAddress } = loan
    const { NETWORK } = process.env
    if (NETWORK === 'mainnet' || NETWORK === 'kovan') {
      let baseUrl
      if (NETWORK === 'mainnet') {
        baseUrl = 'https://blockstream.info'
      } else {
        baseUrl = 'https://blockstream.info/testnet'
      }
      try {
        console.log(`${baseUrl}/api/addresss/${collateralRefundableP2SHAddress}`)
        const { status, data: refundableAddressInfo } = await axios.get(`${baseUrl}/api/addresss/${collateralRefundableP2SHAddress}`)
        const { data: seizableAddressInfo } = await axios.get(`${baseUrl}/api/addresss/${collateralSeizableP2SHAddress}`)
        if (status === 200) {
          const { chain_stats: refChainStats } = refundableAddressInfo
          const { chain_stats: sezChainStats } = seizableAddressInfo
          if (refChainStats.funded_txo_sum > 0 && sezChainStats.funded_txo_sum > 0) {
            const refDif = refChainStats.funded_txo_sum - refChainStats.spent_txo_sum
            const sezDif = sezChainStats.funded_txo_sum - sezChainStats.spent_txo_sum
            if (refDif === 0 && sezDif === 0) {
              const secret = loan.lenderSecrets[1]
              if (sha256(secret) === sale.secretHashB) {
                console.log('LENDER SECRET MATCHES')
                sale.secretB = secret
                sale.status = 'SECRETS_PROVIDED'
              }
            }
          }
        }
      } catch (e) {
        handleError(e)
      }
    }
    const { accepted } = await sales.methods.sales(numToBytes32(saleId)).call()
    if (accepted) {
      saleModel.status = 'ACCEPTED'
      loan.status = 'LIQUIDATED'
    }
  } else if (paid) {
    loan.status = 'REPAID'
  } else if (withdrawn) {
    loan.status = 'WITHDRAWN'
  } else if (approved) {
    loan.status = 'APPROVED'
  } else {
    loan.status = 'AWAITING_COLLATERAL'
  }
  await loan.save()
  if (saleModel) {
    saleModel.loanModelId = loan.id
    await saleModel.save()
  }
}


async function approveTokens (loanMarket, agenda) {
  const { principalAddress } = await loanMarket.getAgentAddresses()
  const { principal } = loanMarket

  const token = getObject('erc20', principal)
  const fundsAddress = getContract('funds', principal)

  const allowance = await token.methods.allowance(principalAddress, fundsAddress).call()
  const approve = await Approve.findOne({ principal, status: { $nin: ['FAILED'] } }).exec()

  if (parseInt(allowance) === 0 || !approve) {
    await agenda.schedule(getInterval('ACTION_INTERVAL'), 'approve-tokens', { loanMarketModelId: loanMarket.id })
  } else {
    const fundModels = await Fund.find({ status: 'WAITING_FOR_APPROVE', principal }).exec()

    if (fundModels.length > 0) {
      const fund = fundModels[0]
      await agenda.schedule(getInterval('ACTION_INTERVAL'), 'create-fund-ish', { fundModelId: fund.id })
    }
  }
}

module.exports = {
  defineLoanStatusJobs
}

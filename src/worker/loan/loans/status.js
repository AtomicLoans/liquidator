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
          const { principal, collateral } = loanMarket

          const loans = getObject('loans', principal)
          const sales = getObject('sales', principal)

          if (!isArbiter()) {
            await approveTokens(loanMarket, agenda)

            const fundModel = await Fund.findOne({ principal }).exec()
            if (!fundModel) {
              await repopulateLenderFund(loanMarket)
            }

            const lenderLoanCount = await loans.methods.lenderLoanCount(principalAddress).call()
            const loanModels = await Loan.find({ principal }).exec()
            if (lenderLoanCount > 0 && loanModels.length === 0) {
              await repopulateLenderLoans(loanMarket, principal, principalAddress, collateral, lenderLoanCount, loans, sales)
            }
          }

          const loanModels = await Loan.find({ principal, status: { $nin: ['QUOTE', 'REQUESTING', 'CANCELLING', 'CANCELLED', 'ACCEPTING', 'ACCEPTED', 'LIQUIDATED', 'FAILED'] } })

          for (let j = 0; j < loanModels.length; j++) {
            const loan = loanModels[j]
            const { loanId, loanExpiration, lastWarningSent } = loan

            const { approved, withdrawn, sale, paid, off } = await loans.methods.bools(numToBytes32(loanId)).call()

            const [approveExpiration, currentTime] = await Promise.all([
              loans.methods.approveExpiration(numToBytes32(loanId)).call(),
              getCurrentTime()
            ])

            // Cancel loan if not withdrawn within 22 hours after approveExpiration
            if ((currentTime > (parseInt(approveExpiration) + 79200)) && !withdrawn) {
              await agenda.schedule(getInterval('ACTION_INTERVAL'), 'accept-or-cancel-loan', { loanModelId: loan.id })
              console.log('accept or cancel 4')
            }

            if (isArbiter()) {
              // Warn if loan is about to expire in a day
              if (((Date.now() / 1000) - (lastWarningSent || 0) > 86400) && (currentTime > (parseInt(loanExpiration) - 86400))) {
                mailer.notify(loan.borrowerPrincipalAddress, 'loan-expiring', {
                  loanId: loan.loanId,
                  asset: loan.principal
                })
                loan.lastWarningSent = Date.now()
                await loan.save()
              }
            }

            if (!approved && !withdrawn && !paid && !sale && !off) {
              // CHECK LOCK COLLATERAL

              // Cancel loan if collateral not locked before approve expiration
              if ((currentTime > parseInt(approveExpiration)) && !approved) {
                // TODO: arbiter should check if lender agent has already tried cancelling
                await agenda.schedule(getInterval('ACTION_INTERVAL'), 'accept-or-cancel-loan', { loanModelId: loan.id })
                console.log('accept or cancel 5')
              } else {
                const { collateralRefundableP2SHAddress, collateralSeizableP2SHAddress, refundableCollateralAmount, seizableCollateralAmount } = loan

                const [refundableBalance, seizableBalance, refundableUnspent, seizableUnspent] = await Promise.all([
                  loan.collateralClient().chain.getBalance([collateralRefundableP2SHAddress]),
                  loan.collateralClient().chain.getBalance([collateralSeizableP2SHAddress]),
                  loan.collateralClient().getMethod('getUnspentTransactions')([collateralRefundableP2SHAddress]),
                  loan.collateralClient().getMethod('getUnspentTransactions')([collateralSeizableP2SHAddress])
                ])

                const collateralRequirementsMet = (refundableBalance.toNumber() >= refundableCollateralAmount && seizableBalance.toNumber() >= seizableCollateralAmount)
                const refundableConfirmationRequirementsMet = refundableUnspent.length === 0 ? false : refundableUnspent[0].confirmations > 0
                const seizableConfirmationRequirementsMet = seizableUnspent.length === 0 ? false : seizableUnspent[0].confirmations > 0

                if (collateralRequirementsMet && refundableConfirmationRequirementsMet && seizableConfirmationRequirementsMet && loan.status === 'AWAITING_COLLATERAL') {
                  console.log('COLLATERAL LOCKED')

                  if (!isArbiter()) {
                    await agenda.schedule(getInterval('ACTION_INTERVAL'), 'approve-loan', { loanModelId: loan.id })
                  }
                } else {
                  console.log('COLLATERAL NOT LOCKED')
                }
              }
            } else if (withdrawn && !paid && !sale && !off) {
              loan.status = 'WITHDRAWN'

              const alertCollateralAmount = loan.minimumCollateralAmount * 1.1

              const market = await Market.findOne({ from: loan.collateral, to: loan.principal }).exec()
              const { rate } = market

              if (isArbiter()) {
                if (((Date.now() / 1000) - (lastWarningSent || 0) > 86400) && loan.collateralAmount < alertCollateralAmount) {
                  mailer.notify(loan.borrowerPrincipalAddress, 'loan-near-liquidation', {
                    loanId: loan.loanId,
                    asset: loan.principal,
                    liquidation_price: BN(loan.minimumCollateralAmount).dividedBy(loan.collateralAmount).times(rate).toFixed(2)
                  })
                  loan.lastWarningSent = Date.now()
                }
              }

              await loan.save()
            } else if (withdrawn && paid && !sale && !off) {
              loan.status = 'REPAID'
              await loan.save()
              console.log('REPAID')
              if (isArbiter()) {
                const lender = await loans.methods.lender(numToBytes32(loanId)).call()

                const agent = await Agent.findOne({ principalAddress: lender }).exec()

                let safePrincipal = principal
                if (principal === 'SAI') {
                  const { data: versionData } = await axios.get(`${agent.url}/version`)
                  const { version } = versionData

                  if (compareVersions(version, '0.1.31', '<')) {
                    safePrincipal = 'DAI'
                  }
                }

                try {
                  const { status, data: lenderLoanModel } = await axios.get(`${agent.url}/loans/contract/${safePrincipal}/${loanId}`)
                  const { status: lenderLoanStatus } = lenderLoanModel

                  // if it can't be reached or status currently isn't ACCEPTING / ACCEPTED then do something
                  if (!(status === 200 && (lenderLoanStatus === 'ACCEPTING' || lenderLoanStatus === 'ACCEPTED'))) {
                    await agenda.now('accept-or-cancel-loan', { loanModelId: loan.id })
                    console.log('accept or cancel 1')
                  }
                } catch (e) {
                  await agenda.now('accept-or-cancel-loan', { loanModelId: loan.id })
                  console.log('accept or cancel 2')
                }
              } else {
                await agenda.now('accept-or-cancel-loan', { loanModelId: loan.id })
                console.log('accept or cancel 3')
              }
            } else if (sale) {
              const saleModel = await Sale.findOne({ loanModelId: loan.id }).exec()

              if (isArbiter() && saleModel && saleModel.status !== 'FAILED') {
                const collateralBlockHeight = await saleModel.collateralClient().getMethod('getBlockHeight')()
                const { latestCollateralBlock, claimTxHash, status } = saleModel

                if (saleModel && collateralBlockHeight > latestCollateralBlock && !claimTxHash) {
                  agenda.now('verify-collateral-claim', { saleModelId: saleModel.id })
                } else if (saleModel && status === 'COLLATERAL_CLAIMED' && claimTxHash) {
                  console.log('COLLATERAL WAS CLAIMED, SPIN UP JOB TO ACCEPT')
                  agenda.now('accept-sale', { saleModelId: saleModel.id })
                }
              } else if (!isArbiter() && !saleModel) {
                await agenda.now('init-liquidation', { loanModelId: loan.id })
              } else if (!isArbiter() && saleModel && saleModel.status !== 'FAILED') {
                console.log('Try to deposit')

                const sales = getObject('sales', principal)
                const token = getObject('erc20', principal)
                const { accepted } = await sales.methods.sales(numToBytes32(saleModel.saleId)).call()
                if (accepted) {
                  saleModel.status = 'ACCEPTED'
                  await saleModel.save()

                  const fundModel = await Fund.findOne({ principal }).exec()
                  const deposit = await Deposit.findOne({ fundModelId: fundModel.id, saleId: saleModel.saleId }).exec()

                  if (!deposit) {
                    const owedToLender = await loans.methods.owedToLender(numToBytes32(loanId)).call()
                    const tokenBalance = await token.methods.balanceOf(principalAddress).call()

                    if (tokenBalance >= owedToLender) {
                      const unit = currencies[principal].unit

                      const amountToDeposit = fromWei(owedToLender.toString(), unit)
                      await agenda.now('fund-deposit', { fundModelId: fundModel.id, amountToDeposit, saleId: saleModel.saleId })
                    }
                  } else {
                    loan.status = 'LIQUIDATED'
                    await loan.save()
                  }
                }
              }
            } else if (off) {
              if (!paid) {
                const collateralRequirementsMet = await isCollateralRequirementsSatisfied(loan)

                mailer.notify(loan.borrowerPrincipalAddress, 'loan-cancelled', {
                  loanId: loan.loanId,
                  asset: loan.principal,
                  approved,
                  collateralRequirementsMet,
                  minCollateralAmount: loan.minimumCollateralAmount
                })
                loan.status = 'CANCELLED'
              } else {
                mailer.notify(loan.borrowerPrincipalAddress, 'loan-accepted', {
                  loanId: loan.loanId,
                  asset: loan.principal
                })
                loan.status = 'ACCEPTED'
              }
              await loan.save()
              console.log('LOAN IS ACCEPTED, CANCELLED, OR REFUNDED')
            } else if (approved && loan.status === 'AWAITING_COLLATERAL') {
              mailer.notify(loan.borrowerPrincipalAddress, 'collateral-locked', {
                amount: loan.principalAmount,
                asset: loan.principal,
                loanId: loan.loanId
              })

              loan.status = 'APPROVED'
              await loan.save()
            }
          }

          await checkCollateralLocked(loanMarket)
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

async function repopulateLenderLoans (loanMarket, principal, principalAddress, collateral, lenderLoanCount, loans, sales) {
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

async function repopulateLenderFund (loanMarket) {
  const { principalAddress } = await loanMarket.getAgentAddresses()
  const { principal, collateral } = loanMarket
  const funds = getObject('funds', principal)

  const fundIdBytes32 = await funds.methods.fundOwner(principalAddress).call()
  const fundId = hexToNumber(fundIdBytes32)
  if (fundId > 0) {
    console.log('principal', principal)
    console.log('Repopulate Funds')
    const { maxLoanDur, fundExpiry } = await funds.methods.funds(numToBytes32(fundId)).call()
    const { custom, compoundEnabled } = await funds.methods.bools(numToBytes32(fundId)).call()

    if (!custom) {
      const params = { principal, collateral, custom, maxLoanDuration: maxLoanDur, fundExpiry, compoundEnabled, amount: 0 }
      const fund = Fund.fromFundParams(params)
      fund.status = 'CREATED'
      fund.fundId = fundId
      await fund.save()
    } else {
      const { liquidationRatio, interest, penalty, fee } = await funds.methods.funds(numToBytes32(fundId)).call()

      const params = {
        principal,
        collateral,
        custom,
        maxLoanDuration: maxLoanDur,
        fundExpiry,
        compoundEnabled,
        liquidationRatio,
        interest,
        penalty,
        fee,
        amount: 0
      }
      const fund = Fund.fromCustomFundParams(params)
      fund.status = 'CREATED'
      fund.fundId = fundId
      await fund.save()
    }
  }
}

async function checkCollateralLocked (loanMarket) {
  const { principal } = loanMarket
  const finalLoanModels = await Loan.find({ principal, status: { $in: ['CANCELLED', 'ACCEPTED', 'LIQUIDATED', 'FAILED'] }, collateralLocked: true }).exec()
  const onGoingLoanModels = await Loan.find({ principal, status: { $nin: ['QUOTE', 'REQUESTING', 'CANCELLED', 'ACCEPTED', 'LIQUIDATED', 'FAILED'] } }).exec()

  await updateCollateralValues(finalLoanModels, loanMarket)
  await updateCollateralValues(onGoingLoanModels, loanMarket)

  await updateMinCollateralValues(onGoingLoanModels, loanMarket)
}

async function updateCollateralValues (loanModels, loanMarket) {
  for (let k = 0; k < loanModels.length; k++) {
    const loan = loanModels[k]

    const { collateral, collateralRefundableP2SHAddress, collateralSeizableP2SHAddress } = loan

    const [refundableBalanceInUnits, seizableBalanceInUnits] = await Promise.all([
      loan.collateralClient().chain.getBalance([collateralRefundableP2SHAddress]),
      loan.collateralClient().chain.getBalance([collateralSeizableP2SHAddress])
    ])

    const refundableBalance = BN(refundableBalanceInUnits.toNumber()).dividedBy(currencies[collateral].multiplier).toFixed(currencies[collateral].decimals)
    const seizableBalance = BN(seizableBalanceInUnits.toNumber()).dividedBy(currencies[collateral].multiplier).toFixed(currencies[collateral].decimals)

    if (loan.refundableCollateralValue !== refundableBalance) {
      const deltaRefundableValue = BN(loan.refundableCollateralValue).minus(refundableBalance)

      loanMarket.totalCollateralValue = BN(loanMarket.totalCollateralValue).minus(deltaRefundableValue).toFixed()
      loan.refundableCollateralValue = refundableBalance
    }

    if (loan.seizableCollateralValue !== seizableBalance) {
      const deltaSeizableValue = BN(loan.seizableCollateralValue).minus(seizableBalance)

      loanMarket.totalCollateralValue = BN(loanMarket.totalCollateralValue).minus(deltaSeizableValue).toFixed()
      loan.seizableCollateralValue = seizableBalance
    }

    if (parseFloat(refundableBalance) === 0 && parseFloat(seizableBalance) === 0) {
      loan.collateralLocked = false
    } else {
      loan.collateralLocked = true
    }

    await loan.save()
    await loanMarket.save()
  }
}

async function updateMinCollateralValues (loanModels, loanMarket) {
  for (let i = 0; i < loanModels.length; i++) {
    const loan = loanModels[i]

    const { principal, collateral, loanId } = loan

    try {
      const loans = getObject('loans', principal)

      const liquidationRatioInUnits = await loans.methods.liquidationRatio(numToBytes32(loanId)).call()
      const liquidationRatio = fromWei(liquidationRatioInUnits, 'gether')

      const minSeizableCollateralValue = await loans.methods.minSeizableCollateralValue(numToBytes32(loanId)).call()

      const minCollateralValue = BN(Math.ceil(BN(minSeizableCollateralValue).times(liquidationRatio).toNumber())).dividedBy(currencies[collateral].multiplier).toFixed(currencies[collateral].decimals)

      loan.minimumCollateralAmount = minCollateralValue
      await loan.save()
    } catch (e) {
      console.log('Error updateMinCollateralValues:', e)
      handleError(e)
    }
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
  defineLoanStatusJobs,
  checkCollateralLocked,
  updateCollateralValues,
  updateMinCollateralValues
}

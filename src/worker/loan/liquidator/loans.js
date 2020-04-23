const BN = require('bignumber.js')

const Loan = require('../../../models/Loan')
const LoanMarket = require('../../../models/LoanMarket')
const Market = require('../../../models/Market')
const { getObject } = require('../../../utils/contracts')
const { getMarketModels } = require('../utils/models')
const { getLockArgs, getCollateralAmounts } = require('../utils/collateral')
const { numToBytes32 } = require('../../../utils/finance')
const { currencies } = require('../../../utils/fx')
const { getCurrentTime } = require('../../../utils/time')
const web3 = require('../../../utils/web3')

const { fromWei } = web3().utils

function defineLiquidatorLoanJobs (agenda) {
  // Add loan records that current don't exist

  // look through all loans every minute, and update the state based on bools

  // Accept / Cancel loans that should be accepted / cancelled
  // Update state of loans that have been accepted / cancelled by lender

  agenda.define('update-loan-records', async (job, done) => {
    const { data } = job.attrs
    const { loanMarketId } = data

    console.log('update-loan-records')

    const loanMarket = await LoanMarket.findOne({ _id: loanMarketId }).exec()
    if (!loanMarket) return console.log('Error: LoanMarket not found')

    const { principal, collateral } = loanMarket

    const market = await Market.findOne({ from: collateral, to: principal }).exec()
    if (!market) return console.log('Error: Market not found')

    const loansContract = getObject('loans', principal)

    const loanIndex = await loansContract.methods.loanIndex().call()

    let currentIndex = loanMarket.loanIndex + 1

    while (currentIndex <= loanIndex) {
      const [loans, bools, approveExpiration, acceptExpiration] = await Promise.all([
        loansContract.methods.loans(numToBytes32(currentIndex)).call(),
        loansContract.methods.bools(numToBytes32(currentIndex)).call(),
        loansContract.methods.approveExpiration(numToBytes32(currentIndex)).call(),
        loansContract.methods.acceptExpiration(numToBytes32(currentIndex)).call()
      ])

      const { approved, withdrawn, sale, paid, off } = bools
      const { loanExpiration, borrower, lender } = loans

      const currentTime = await getCurrentTime()

      let status

      if (!approved) {
        if (currentTime < approveExpiration) {
          status = 'AWAITING_COLLATERAL'
        } else {
          status = 'CANCELLING'
          // TODO: ARBITER SHOULD CREATE JOB TO CANCEL LOAN
        }
      } else if (!withdrawn) {
        status = 'APPROVED'
      } else if (!paid) {
        if (!sale) {
          if (currentTime < loanExpiration) {
            status = 'WITHDRAWN'
          } else {
            // DEFAULTED
            // STATUS is going to be LIQUIDATING
          }
        } else {
          status = 'LIQUIDATING'
        }
      } else if (!sale && !off) {
        if (currentTime < acceptExpiration) {
          status = 'REPAID'
          // TODO: ARBITER SHOULD CREATE JOB TO ACCEPT LOAN
        } else {
          // BAD FUCK UP
        }
      } else {
        status = 'ACCEPTED'
      }

      const { market } = await getMarketModels(principal, collateral)
      const { rate } = market

      const unit = currencies[principal].unit
      const { principal: principalAmountInWei, createdAt, liquidationRatio } = loans
      const principalAmount = fromWei(principalAmountInWei, unit)
      const loanDuration = loanExpiration - createdAt
      const params = { principal, collateral, principalAmount, loanDuration }
      const minimumCollateralAmount = BN(principalAmount).dividedBy(rate).times(fromWei(liquidationRatio, 'gether')).toFixed(8)
      const loanId = currentIndex

      const loanExists = await Loan.findOne({ principal, loanId }).exec()

      if (!loanExists) {
        const loan = Loan.fromLoanMarket(loanMarket, params, minimumCollateralAmount)

        loan.status = status
        loan.loanId = currentIndex

        const lockArgs = await getLockArgs(numToBytes32(currentIndex), principal, collateral)
        const addresses = await loan.collateralClient().loan.collateral.getLockAddresses(...lockArgs)

        const collateralAmountInSats = await loansContract.methods.collateral(numToBytes32(currentIndex)).call()
        loan.collateralAmount = BN(collateralAmountInSats).dividedBy(currencies[collateral].multiplier).toFixed(currencies[collateral].decimals)
        const amounts = await getCollateralAmounts(numToBytes32(currentIndex), loan, rate)
        loan.setCollateralAddressValues(addresses, amounts)
        loan.borrowerPrincipalAddress = borrower
        loan.lenderPrincipalAddress = lender
        loan.loanExpiration = loanExpiration

        await loan.save()
      }

      currentIndex++
    }

    loanMarket.loanIndex = loanIndex
    await loanMarket.save()

    done()
  })
}

module.exports = {
  defineLiquidatorLoanJobs
}

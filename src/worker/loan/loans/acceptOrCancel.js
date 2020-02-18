const { ensure0x, remove0x } = require('@liquality/ethereum-utils')
const axios = require('axios')
const date = require('date.js')
const compareVersions = require('compare-versions')
const Agent = require('../../../models/Agent')
const Loan = require('../../../models/Loan')
const LoanMarket = require('../../../models/LoanMarket')
const EthTx = require('../../../models/EthTx')
const Secret = require('../../../models/Secret')
const { numToBytes32 } = require('../../../utils/finance')
const { getObject, getContract } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { setTxParams, bumpTxFee, sendTransaction } = require('../utils/web3Transaction')
const { isArbiter } = require('../../../utils/env')
const getMailer = require('../utils/mailer')
const { isCollateralRequirementsSatisfied } = require('../utils/collateral')
const handleError = require('../../../utils/handleError')
const web3 = require('../../../utils/web3')

function defineLoanAcceptOrCancelJobs (agenda) {
  const mailer = getMailer(agenda)
  agenda.define('accept-or-cancel-loan', async (job, done) => {
    const { data } = job.attrs
    const { loanModelId } = data

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    if (!loan) return console.log('Error: Loan not found')

    const { loanId, principal, lenderSecrets } = loan
    const loans = getObject('loans', principal)
    const { off } = await loans.methods.bools(numToBytes32(loanId)).call()

    const loanMarket = await LoanMarket.findOne({ principal }).exec()
    const { principalAddress } = await loanMarket.getAgentAddresses()

    if (off === true) {
      console.log('Loan already accepted')
      done()
    } else {
      // If Arbiter, check if lender agent is already accepting, if not accept
      // If Lender, just accept

      let lenderAccepting = false
      if (isArbiter()) {
        const { lender } = await loans.methods.loans(numToBytes32(loanId)).call()
        const agent = await Agent.findOne({ principalAddress: lender }).exec()
        if (agent) {
          try {
            let safePrincipal = principal
            if (principal === 'SAI') {
              const { data: versionData } = await axios.get(`${agent.url}/version`)
              const { version } = versionData

              if (compareVersions(version, '0.1.31', '<')) {
                safePrincipal = 'DAI'
              }
            }

            const { status, data } = await axios.get(`${agent.url}/loans/contract/${safePrincipal}/${loanId}`)
            console.log(`${agent.url} status:`, status)
            if (status === 200) {
              const { acceptOrCancelTxHash } = data
              if (acceptOrCancelTxHash) {
                lenderAccepting = true
              }
            }
          } catch (e) {
            console.log(`Agent ${agent.url} not active`)
          }
        }
      }

      if (!isArbiter() || !lenderAccepting) {
        let txData
        if (isArbiter()) {
          const { secretHashC1 } = await loans.methods.secretHashes(numToBytes32(loanId)).call()

          const secretModel = await Secret.findOne({ secretHash: remove0x(secretHashC1) })

          txData = loans.methods.accept(numToBytes32(loanId), ensure0x(secretModel.secret)).encodeABI()
        } else {
          txData = loans.methods.accept(numToBytes32(loanId), ensure0x(lenderSecrets[0])).encodeABI()
        }
        const ethTx = await setTxParams(txData, ensure0x(principalAddress), getContract('loans', principal), loan)
        console.log('sending tx to accept')
        await sendTransaction(ethTx, loan, agenda, done, txSuccess, txFailure)
      }
    }
  })

  agenda.define('verify-accept-or-cancel-loan-ish', async (job, done) => {
    const { data } = job.attrs
    const { loanModelId } = data

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    if (!loan) return console.log('Error: Loan not found')
    const { acceptOrCancelTxHash } = loan

    const receipt = await web3().eth.getTransactionReceipt(acceptOrCancelTxHash)

    if (receipt === null) {
      console.log('RECEIPT IS NULL')

      const ethTx = await EthTx.findOne({ _id: loan.ethTxId }).exec()
      if (!ethTx) return console.log('Error: EthTx not found')

      if (date(getInterval('BUMP_TX_INTERVAL')) > ethTx.updatedAt && loan.status !== 'FAILED') {
        console.log('BUMPING TX FEE')

        await bumpTxFee(ethTx)
        await sendTransaction(ethTx, loan, agenda, done, txSuccess, txFailure)
      } else {
        await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-accept-or-cancel-loan-ish', { loanModelId })
      }
    } else if (receipt.status === false) {
      console.log('RECEIPT STATUS IS FALSE')
      console.log('TX WAS MINED BUT TX FAILED')
    } else {
      console.log('RECEIPT IS NOT NULL')

      const { principal, loanId } = loan
      const loans = getObject('loans', principal)
      const { approved, paid } = await loans.methods.bools(numToBytes32(loanId)).call()

      if (paid) {
        console.log('ACCEPTED')
        loan.status = 'ACCEPTED'
        mailer.notify(loan.borrowerPrincipalAddress, 'loan-accepted', {
          loanId: loan.loanId,
          asset: loan.principal
        })
        await loan.save()
      } else {
        console.log('CANCELLED')
        loan.status = 'CANCELLED'

        const collateralRequirementsMet = await isCollateralRequirementsSatisfied(loan)

        mailer.notify(loan.borrowerPrincipalAddress, 'loan-cancelled', {
          loanId: loan.loanId,
          asset: loan.principal,
          approved,
          collateralRequirementsMet,
          minCollateralAmount: loan.minimumCollateralAmount
        })

        await loan.save()
      }
    }

    done()
  })
}

async function txSuccess (transactionHash, ethTx, instance, agenda) {
  const loan = instance

  const { principal, loanId } = loan
  const loans = getObject('loans', principal)
  const paid = await loans.methods.paid(numToBytes32(loanId)).call()
  loan.ethTxId = ethTx.id
  loan.acceptOrCancelTxHash = transactionHash
  if (paid) {
    loan.status = 'ACCEPTING'
    console.log('ACCEPTING')
  } else {
    loan.status = 'CANCELLING'
    console.log('CANCELLING')
  }
  await loan.save()
  await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-accept-or-cancel-loan-ish', { loanModelId: loan.id })
}

async function txFailure (error, instance) {
  const accept = instance

  console.log('FAILED TO ACCEPT OR CANCEL')
  accept.status = 'FAILED'
  await accept.save()

  handleError(error)
}

module.exports = {
  defineLoanAcceptOrCancelJobs
}

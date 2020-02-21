const Loan = require('../../../models/Loan')
const EthTx = require('../../../models/EthTx')
const { numToBytes32 } = require('../../../utils/finance')
const { getObject, getContract } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { ensure0x } = require('@liquality/ethereum-utils')
const { setTxParams, bumpTxFee, sendTransaction } = require('../utils/web3Transaction')
const handleError = require('../../../utils/handleError')
const web3 = require('../../../utils/web3')
const date = require('date.js')

function defineLoanLiquidateJobs (agenda) {
  agenda.define('liquidate-loan', async (job, done) => {
    const { data } = job.attrs
    const { loanModelId } = data

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    if (!loan) return console.log('Error: Loan not found')

    const { loanId, principal, lenderPrincipalAddress } = loan
    const loans = getObject('loans', principal)
    const approved = await loans.methods.approved(numToBytes32(loanId)).call()

    if (approved === true) {
      console.log('Loan already approved')
      done()
    } else {
      const txData = loans.methods.approve(numToBytes32(loanId)).encodeABI()
      const ethTx = await setTxParams(txData, ensure0x(lenderPrincipalAddress), getContract('loans', principal), loan)
      await sendTransaction(ethTx, loan, agenda, done, txSuccess, txFailure)
    }
  })

  agenda.define('verify-liquidate-loan', async (job, done) => {
    const { data } = job.attrs
    const { loanModelId } = data

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    if (!loan) return console.log('Error: Loan not found')
    const { approveTxHash } = loan

    console.log('CHECKING LOAN APPROVE')

    const receipt = await web3().eth.getTransactionReceipt(approveTxHash)

    if (receipt === null) {
      console.log('RECEIPT IS NULL')

      const ethTx = await EthTx.findOne({ _id: loan.ethTxId }).exec()
      if (!ethTx) return console.log('Error: EthTx not found')

      if (date(getInterval('BUMP_TX_INTERVAL')) > ethTx.updatedAt && loan.status !== 'FAILED') {
        console.log('BUMPING TX FEE')

        await bumpTxFee(ethTx)
        await sendTransaction(ethTx, loan, agenda, done, txSuccess, txFailure)
      } else {
        await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-approve-loan-ish', { loanModelId })
      }
    } else if (receipt.status === false) {
      console.log('RECEIPT STATUS IS FALSE')
      console.log('TX WAS MINED BUT TX FAILED')
    } else {
      console.log('RECEIPT IS NOT NULL')

      const { principal, loanId } = loan
      const loans = getObject('loans', principal)
      const approved = await loans.methods.approved(numToBytes32(loanId)).call()

      if (approved) {
        console.log('APPROVED')
        loan.status = 'APPROVED'
        await loan.save()
        done()
      } else {
        console.log('TX WAS NOT APPROVED')
      }
    }
  })
}

async function txSuccess (transactionHash, ethTx, instance, agenda) {
  const loan = instance

  loan.ethTxId = ethTx.id
  loan.approveTxHash = transactionHash
  loan.status = 'APPROVING'
  loan.save()
  console.log('APPROVING')
  await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-approve-loan-ish', { loanModelId: loan.id })
}

async function txFailure (error, instance) {
  console.log('APPROVE LOAN FAILED')

  const loan = instance

  loan.status = 'FAILED'
  await loan.save()

  handleError(error)
}

module.exports = {
    defineLoanLiquidateJobs
}

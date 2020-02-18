const { ensure0x } = require('@liquality/ethereum-utils')
const date = require('date.js')
const Loan = require('../../../models/Loan')
const Sale = require('../../../models/Sale')
const LoanMarket = require('../../../models/LoanMarket')
const EthTx = require('../../../models/EthTx')
const { numToBytes32 } = require('../../../utils/finance')
const { getObject, getContract } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { setTxParams, bumpTxFee, sendTransaction } = require('../utils/web3Transaction')
const handleError = require('../../../utils/handleError')
const web3 = require('../../../utils/web3')
const getMailer = require('../utils/mailer')

function defineSalesAcceptJobs (agenda) {
  const mailer = getMailer(agenda)
  agenda.define('accept-sale', async (job, done) => {
    const { data } = job.attrs
    const { saleModelId } = data

    const sale = await Sale.findOne({ _id: saleModelId }).exec()
    if (!sale) return console.log('Error: Sale not found')

    const { claimTxHash, saleId, principal } = sale
    const sales = getObject('sales', principal)
    const { accepted } = await sales.methods.sales(numToBytes32(saleId)).call()

    if (accepted === true) {
      sale.status = 'ACCEPTED'
      await sale.save()
      console.log('Sale was already accepted')
      done()
    } else {
      const claimTx = await sale.collateralClient().getMethod('getTransactionByHash')(claimTxHash)
      const claimArgs = claimTx._raw.vin[0].txinwitness

      const secretB = claimArgs[4]
      const secretC = claimArgs[3]
      const secretD = claimArgs[2]

      const txData = sales.methods.provideSecretsAndAccept(numToBytes32(saleId), [ensure0x(secretB), ensure0x(secretC), ensure0x(secretD)]).encodeABI()

      const loanMarket = await LoanMarket.findOne({ principal }).exec()
      const { principalAddress } = await loanMarket.getAgentAddresses()

      const ethTx = await setTxParams(txData, ensure0x(principalAddress), getContract('sales', principal), sale)
      await sendTransaction(ethTx, sale, agenda, done, txSuccess, txFailure)
    }
  })

  agenda.define('verify-accept-sale', async (job, done) => {
    const { data } = job.attrs
    const { saleModelId } = data

    const sale = await Sale.findOne({ _id: saleModelId }).exec()
    if (!sale) return console.log('Error: Sale not found')
    const { acceptTxHash } = sale

    const receipt = await web3().eth.getTransactionReceipt(acceptTxHash)

    if (receipt === null) {
      console.log('RECEIPT IS NULL')

      const ethTx = await EthTx.findOne({ _id: sale.ethTxId }).exec()
      if (!ethTx) return console.log('Error: EthTx not found')

      if (date(getInterval('BUMP_TX_INTERVAL')) > ethTx.updatedAt && sale.status !== 'FAILED') {
        console.log('BUMPING TX FEE')

        await bumpTxFee(ethTx)
        await sendTransaction(ethTx, sale, agenda, done, txSuccess, txFailure)
      } else {
        await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-accept-sale', { saleModelId })
      }
    } else if (receipt.status === false) {
      console.log('RECEIPT STATUS IS FALSE')
      console.log('TX WAS MINED BUT TX FAILED')
    } else {
      console.log('RECEIPT IS NOT NULL')
      console.log('ACCEPTED')

      sale.status = 'ACCEPTED'
      await sale.save()

      const loan = await Loan.findOne({ _id: sale.loanModelId }).exec()
      if (!loan) return console.log('Error: Loan not found')

      mailer.notify(loan.borrowerPrincipalAddress, 'loan-liquidated', {
        loanId: loan.loanId,
        asset: loan.principal
      })

      loan.status = 'LIQUIDATED'
      await loan.save()
    }

    done()
  })
}

async function txSuccess (transactionHash, ethTx, instance, agenda) {
  const sale = instance

  sale.ethTxId = ethTx.id
  sale.acceptTxHash = transactionHash
  sale.status = 'ACCEPTING'
  console.log('ACCEPTING')
  await sale.save()
  await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-accept-sale', { saleModelId: sale.id })
}

async function txFailure (error, instance) {
  const accept = instance

  console.log('FAILED TO ACCEPT')
  accept.status = 'FAILED'
  await accept.save()

  handleError(error)
}

module.exports = {
  defineSalesAcceptJobs
}

const Sale = require('../../../models/Sale')
const EthTx = require('../../../models/EthTx')
const LoanMarket = require('../../../models/LoanMarket')
const { numToBytes32 } = require('../../../utils/finance')
const { getObject, getContract } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { ensure0x } = require('@liquality/ethereum-utils')
const { setTxParams, bumpTxFee, sendTransaction } = require('../utils/web3Transaction')
const handleError = require('../../../utils/handleError')
const web3 = require('../../../utils/web3')
const date = require('date.js')

function defineSaleRefundJobs (agenda) {
  agenda.define('refund-sale', async (job, done) => {
    const { data } = job.attrs
    const { saleModelId } = data

    const sale = await Sale.findOne({ _id: saleModelId }).exec()
    if (!sale) return console.log('Error: Sale not found')

    const { saleId, principal, collateral } = sale

    const loanMarket = await LoanMarket.findOne({ principal, collateral }).exec()
    if (!loanMarket) return console.log('Error: Loan Market not found')

    const { principalAddress } = await loanMarket.getAgentAddresses()

    const sales = getObject('sales', principal)

    const txData = sales.methods.refund(numToBytes32(saleId)).encodeABI()
    const ethTx = await setTxParams(txData, ensure0x(principalAddress), getContract('sales', principal), sale)
    await sendTransaction(ethTx, sale, agenda, done, txSuccess, txFailure)
  })

  agenda.define('verify-refund-sale', async (job, done) => {
    const { data } = job.attrs
    const { saleModelId } = data

    const sale = await Sale.findOne({ _id: saleModelId }).exec()
    if (!sale) return console.log('Error: Loan not found')
    const { refundTxHash } = sale

    console.log('CHECKING SALE REFUND')

    const receipt = await web3().eth.getTransactionReceipt(refundTxHash)

    if (receipt === null) {
      console.log('RECEIPT IS NULL')

      const ethTx = await EthTx.findOne({ _id: sale.ethTxId }).exec()
      if (!ethTx) return console.log('Error: EthTx not found')

      if (date(getInterval('BUMP_TX_INTERVAL')) > ethTx.updatedAt && sale.status !== 'FAILED') {
        console.log('BUMPING TX FEE')

        await bumpTxFee(ethTx)
        await sendTransaction(ethTx, sale, agenda, done, txSuccess, txFailure)
      } else {
        await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-refund-sale', { saleModelId })
      }
    } else if (receipt.status === false) {
      console.log('RECEIPT STATUS IS FALSE')
      console.log('TX WAS MINED BUT TX FAILED')
    } else {
      console.log('RECEIPT IS NOT NULL')

      console.log('REFUNDED')

      sale.status = 'REFUNDED'
      await sale.save()
    }
    done()
  })
}

async function txSuccess (transactionHash, ethTx, instance, agenda) {
  const sale = instance

  sale.ethTxId = ethTx.id
  sale.refundTxHash = transactionHash
  sale.status = 'REFUNDING'
  sale.save()
  console.log('REFUNDING')
  await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-refund-sale', { saleModelId: sale.id })
}

async function txFailure (error, instance) {
  console.log('REFUNDING SALE FAILED')

  const sale = instance

  sale.status = 'FAILED'
  await sale.save()

  handleError(error)
}

module.exports = {
  defineSaleRefundJobs
}

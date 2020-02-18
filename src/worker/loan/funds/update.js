const Fund = require('../../../models/Fund')
const EthTx = require('../../../models/EthTx')
const Update = require('../../../models/Update')
const { getObject, getContract } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { numToBytes32 } = require('../../../utils/finance')
const { setTxParams, bumpTxFee, sendTransaction } = require('../utils/web3Transaction')
const { getFundParams } = require('../utils/fundParams')
const handleError = require('../../../utils/handleError')
const web3 = require('../../../utils/web3')

const date = require('date.js')

function defineFundUpdateJobs (agenda) {
  agenda.define('fund-update', async (job, done) => {
    console.log('fund-update')
    const { data } = job.attrs
    const { fundModelId, maxLoanDuration, fundExpiry, arbiter } = data

    const fund = await Fund.findOne({ _id: fundModelId }).exec()
    if (!fund) return console.log('Error: Fund not found')

    const { principal, fundId } = fund
    const funds = getObject('funds', principal)
    const { lenderAddress } = await getFundParams(fund)

    const txData = funds.methods.update(numToBytes32(fundId), maxLoanDuration, fundExpiry, arbiter).encodeABI()

    const ethTx = await setTxParams(txData, lenderAddress, getContract('funds', principal), fund)

    const update = Update.fromTxParams({ fundModelId, maxLoanDuration, fundId, arbiter, ethTxId: ethTx.id })
    await update.save()

    await sendTransaction(ethTx, update, agenda, done, txSuccess, txFailure)
  })

  agenda.define('verify-fund-update', async (job, done) => {
    const { data } = job.attrs
    const { updateModelId } = data

    const update = await Update.findOne({ _id: updateModelId }).exec()
    if (!update) return console.log('Error: Update not found')
    const { updateTxHash } = update

    console.log('CHECKING RECEIPT')

    const receipt = await web3().eth.getTransactionReceipt(updateTxHash)

    if (receipt === null) {
      console.log('RECEIPT IS NULL')

      const ethTx = await EthTx.findOne({ _id: update.ethTxId }).exec()
      if (!ethTx) return console.log('Error: EthTx not found')

      if (date(getInterval('BUMP_TX_INTERVAL')) > ethTx.updatedAt && update.status !== 'FAILED') {
        console.log('BUMPING TX FEE')

        await bumpTxFee(ethTx)
        await sendTransaction(ethTx, update, agenda, done, txSuccess, txFailure)
      } else {
        await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-fund-update', { updateModelId })
      }
    } else if (receipt.status === false) {
      console.log('RECEIPT STATUS IS FALSE')
      console.log('TX WAS MINED BUT TX FAILED')
    } else {
      console.log('RECEIPT IS NOT NULL')

      update.status = 'UPDATED'
      await update.save()

      console.log('UPDATE SUCCESSFUL')
    }

    done()
  })
}

async function txSuccess (transactionHash, ethTx, instance, agenda) {
  const update = instance

  console.log('transactionHash', transactionHash)
  update.updateTxHash = transactionHash
  update.status = 'UPDATING'
  await update.save()
  console.log('UPDATING TO FUND')
  await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-fund-update', { updateModelId: update.id })
}

async function txFailure (error, instance) {
  const update = instance

  console.log('UPDATE FAILED')
  update.status = 'FAILED'
  await update.save()

  handleError(error)
}

module.exports = {
  defineFundUpdateJobs
}

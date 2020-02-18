const Fund = require('../../../models/Fund')
const EthTx = require('../../../models/EthTx')
const Withdraw = require('../../../models/Withdraw')
const { getObject, getContract } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { getEthSigner } = require('../../../utils/address')
const { numToBytes32 } = require('../../../utils/finance')
const { currencies } = require('../../../utils/fx')
const { setTxParams, bumpTxFee, sendTransaction } = require('../utils/web3Transaction')
const { getFundParams } = require('../utils/fundParams')
const handleError = require('../../../utils/handleError')
const web3 = require('../../../utils/web3')
const { toWei } = web3().utils
const BN = require('bignumber.js')

const date = require('date.js')

function defineFundWithdrawJobs (agenda) {
  agenda.define('fund-withdraw', async (job, done) => {
    console.log('fund-withdraw')
    const { data } = job.attrs
    const { fundModelId, amountToWithdraw } = data

    const fund = await Fund.findOne({ _id: fundModelId }).exec()
    if (!fund) return console.log('Error: Fund not found')

    const { principal, fundId } = fund
    const unit = currencies[principal].unit
    const funds = getObject('funds', principal)
    const { lenderAddress } = await getFundParams(fund)
    const address = getEthSigner()

    const txData = funds.methods.withdrawTo(numToBytes32(fundId), toWei(amountToWithdraw.toString(), unit), address).encodeABI()

    const ethTx = await setTxParams(txData, lenderAddress, getContract('funds', principal), fund)

    const withdraw = Withdraw.fromTxParams({ fundModelId, fundId, amount: amountToWithdraw, ethTxId: ethTx.id })
    await withdraw.save()

    await sendTransaction(ethTx, withdraw, agenda, done, txSuccess, txFailure)
  })

  agenda.define('verify-fund-withdraw', async (job, done) => {
    const { data } = job.attrs
    const { withdrawModelId } = data

    const withdraw = await Withdraw.findOne({ _id: withdrawModelId }).exec()
    if (!withdraw) return console.log('Error: Withdraw not found')
    const { withdrawTxHash } = withdraw

    console.log('CHECKING RECEIPT')

    const receipt = await web3().eth.getTransactionReceipt(withdrawTxHash)

    if (receipt === null) {
      console.log('RECEIPT IS NULL')

      const ethTx = await EthTx.findOne({ _id: withdraw.ethTxId }).exec()
      if (!ethTx) return console.log('Error: EthTx not found')

      if (date(getInterval('BUMP_TX_INTERVAL')) > ethTx.updatedAt && withdraw.status !== 'FAILED') {
        console.log('BUMPING TX FEE')

        await bumpTxFee(ethTx)
        await sendTransaction(ethTx, withdraw, agenda, done, txSuccess, txFailure)
      } else {
        await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-fund-withdraw', { withdrawModelId })
      }
    } else if (receipt.status === false) {
      console.log('RECEIPT STATUS IS FALSE')
      console.log('TX WAS MINED BUT TX FAILED')
    } else {
      console.log('RECEIPT IS NOT NULL')

      withdraw.status = 'WITHDRAWN'
      await withdraw.save()

      const fund = await Fund.findOne({ _id: withdraw.fundModelId }).exec()
      fund.netDeposit = BN(fund.netDeposit).minus(withdraw.amount).toFixed(18)

      await fund.save()

      console.log('WITHDRAW SUCCESSFUL')
    }

    done()
  })
}

async function txSuccess (transactionHash, ethTx, instance, agenda) {
  const withdraw = instance

  console.log('transactionHash', transactionHash)
  withdraw.withdrawTxHash = transactionHash
  withdraw.status = 'WITHDRAWING'
  await withdraw.save()
  console.log('WITHDRAWING FROM FUND')
  await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-fund-withdraw', { withdrawModelId: withdraw.id })
}

async function txFailure (error, instance) {
  const withdraw = instance

  console.log('WITHDRAW FAILED')
  withdraw.status = 'FAILED'
  await withdraw.save()

  handleError(error)
}

module.exports = {
  defineFundWithdrawJobs
}

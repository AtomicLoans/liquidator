const Fund = require('../../../models/Fund')
const EthTx = require('../../../models/EthTx')
const Deposit = require('../../../models/Deposit')
const { getObject, getContract } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { numToBytes32 } = require('../../../utils/finance')
const { currencies } = require('../../../utils/fx')
const { setTxParams, bumpTxFee, sendTransaction } = require('../utils/web3Transaction')
const { getFundParams } = require('../utils/fundParams')
const handleError = require('../../../utils/handleError')
const web3 = require('../../../utils/web3')
const { toWei } = web3().utils
const BN = require('bignumber.js')

const date = require('date.js')

function defineFundDepositJobs (agenda) {
  agenda.define('fund-deposit', async (job, done) => {
    console.log('fund-deposit')
    const { data } = job.attrs
    const { fundModelId, amountToDeposit, saleId } = data

    const fund = await Fund.findOne({ _id: fundModelId }).exec()
    if (!fund) return console.log('Error: Fund not found')

    const { principal, fundId } = fund
    const unit = currencies[principal].unit
    const funds = getObject('funds', principal)
    const { lenderAddress } = await getFundParams(fund)

    const txData = funds.methods.deposit(numToBytes32(fundId), toWei(amountToDeposit.toString(), unit)).encodeABI()

    const ethTx = await setTxParams(txData, lenderAddress, getContract('funds', principal), fund)

    const deposit = Deposit.fromTxParams({ fundModelId, fundId, amount: amountToDeposit, ethTxId: ethTx.id })
    if (saleId) { deposit.saleId = saleId }
    await deposit.save()

    await sendTransaction(ethTx, deposit, agenda, done, txSuccess, txFailure)
  })

  agenda.define('verify-fund-deposit', async (job, done) => {
    const { data } = job.attrs
    const { depositModelId } = data

    const deposit = await Deposit.findOne({ _id: depositModelId }).exec()
    if (!deposit) return console.log('Error: Deposit not found')
    const { depositTxHash } = deposit

    console.log('CHECKING RECEIPT')

    const receipt = await web3().eth.getTransactionReceipt(depositTxHash)

    if (receipt === null) {
      console.log('RECEIPT IS NULL')

      const ethTx = await EthTx.findOne({ _id: deposit.ethTxId }).exec()
      if (!ethTx) return console.log('Error: EthTx not found')

      if (date(getInterval('BUMP_TX_INTERVAL')) > ethTx.updatedAt && deposit.status !== 'FAILED') {
        console.log('BUMPING TX FEE')

        await bumpTxFee(ethTx)
        await sendTransaction(ethTx, deposit, agenda, done, txSuccess, txFailure)
      } else {
        await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-fund-deposit', { depositModelId })
      }
    } else if (receipt.status === false) {
      console.log('RECEIPT STATUS IS FALSE')
      console.log('TX WAS MINED BUT TX FAILED')
    } else {
      console.log('RECEIPT IS NOT NULL')

      deposit.status = 'DEPOSITED'
      await deposit.save()

      console.log('DEPOSIT SUCCESSFUL')
    }

    done()
  })

  agenda.define('fund-lender-deposit', async (job, done) => {
    console.log('fund-lender-deposit')
    const { data } = job.attrs
    const { ethTxId, fundId, principal } = data

    const fund = await Fund.findOne({ principal, fundId }).exec()
    if (!fund) return done()
    console.log(fund)
    console.log(ethTxId)
    if (fund.depositTxs.includes(ethTxId.toLowerCase())) return done()

    const tokenTransferData = await getTokenTransferData(ethTxId)
    console.log(tokenTransferData)
    if (tokenTransferData) {
      const { status, address, amount, to } = tokenTransferData
      if (!status) return done()

      if (address.toLowerCase() !== getContract('erc20', principal).toLowerCase()) return done()
      if (`0x${to.substr(-40).toLowerCase()}` !== getContract('funds', principal).toLowerCase()) return done()

      const amountInCurrency = BN(amount).dividedBy(currencies[principal].multiplier).toFixed(currencies[principal].decimals)
      fund.netDeposit = BN(fund.netDeposit).plus(amountInCurrency).toFixed(18)
      fund.depositTxs.push(ethTxId.toLowerCase())
      await fund.save()
      console.log('Deposit recorded')
    } else {
      console.log('Null receipt failed... attempting again')

      await agenda.schedule('in 4 seconds', 'fund-lender-deposit', { principal, fundId, ethTxId })
    }
    done()
  })
}

async function getTokenTransferData (txId) {
  try {
    const { logs, status } = await web3().eth.getTransactionReceipt(txId)

    if (status && logs) {
      const [{ address, data, topics: [, from, to] }] = logs
      return { status, address, amount: BN(data), from, to }
    }

    return { status: false }
  } catch (e) {
    return null
  }
}

async function txSuccess (transactionHash, ethTx, instance, agenda) {
  const deposit = instance

  console.log('transactionHash', transactionHash)
  deposit.depositTxHash = transactionHash
  deposit.status = 'DEPOSITING'
  await deposit.save()
  console.log('DEPOSITING TO FUND')
  await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-fund-deposit', { depositModelId: deposit.id })
}

async function txFailure (error, instance) {
  const deposit = instance

  console.log('DEPOSIT FAILED')
  deposit.status = 'FAILED'
  await deposit.save()

  handleError(error)
}

module.exports = {
  defineFundDepositJobs
}

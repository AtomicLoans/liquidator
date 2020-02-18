const axios = require('axios')
const { getAgentUrl } = require('../../../utils/url')
const EthTx = require('../../../models/EthTx')
const handleError = require('../../../utils/handleError')
const web3 = require('../../../utils/web3')
const { toWei } = web3().utils

const { NETWORK, BUGSNAG_API } = process.env

const bugsnag = require('@bugsnag/js')
const bugsnagClient = bugsnag(BUGSNAG_API)

async function setTxParams (data, from, to, instance) {
  const txParams = { data, from, to }

  let txCount, gasPrice, gasLimit, lastBlock
  try {
    [txCount, gasPrice, lastBlock] = await Promise.all([
      web3().eth.getTransactionCount(from),
      web3().eth.getGasPrice(),
      web3().eth.getBlock('latest')
    ])

    try {
      if (process.env.NODE_ENV === 'test') {
        gasLimit = lastBlock.gasLimit
      } else {
        gasLimit = await web3().eth.estimateGas(txParams)
        if ((gasLimit + 100000) < lastBlock.gasLimit) {
          gasLimit = gasLimit + 100000
        }
      }
    } catch (e) {
      gasLimit = 2000000
    }
  } catch (e) {
    console.log('FAILED AT GAS STEP')
    console.log(e)
    instance.status = 'FAILED'
    instance.save()
    throw Error(e)
  }

  const currentGasPrice = gasPrice

  let fastPriceInWei
  try {
    const { data: gasPricesFromOracle } = await axios('https://www.etherchain.org/api/gasPriceOracle')
    const { fast } = gasPricesFromOracle
    fastPriceInWei = parseInt(toWei(fast, 'gwei'))
  } catch (e) {
    fastPriceInWei = currentGasPrice
  }

  if (NETWORK === 'mainnet') {
    txParams.gasPrice = fastPriceInWei
  } else {
    txParams.gasPrice = gasPrice
  }

  txParams.gasPrice = Math.max(txParams.gasPrice, toWei('5', 'gwei'))

  const ethTxs = await EthTx.find().sort({ nonce: 'descending' }).exec()
  if (ethTxs.length === 0) {
    txParams.nonce = txCount
  } else {
    // check to see if any txs have timed out
    const ethTxsFailed = await EthTx.find({ failed: true, overWritten: false }).sort({ nonce: 'ascending' }).exec()
    if (ethTxsFailed.length > 0) {
      const ethTxToReplace = ethTxsFailed[0]
      if (ethTxToReplace.nonce >= txCount) {
        txParams.nonce = ethTxToReplace.nonce
        ethTxToReplace.overWritten = true
        await ethTxToReplace.save()
      } else {
        txParams.nonce = ethTxs[0].nonce + 1
      }
    } else {
      txParams.nonce = ethTxs[0].nonce + 1
    }
  }

  txParams.gasLimit = gasLimit

  const ethTx = EthTx.fromTxParams(txParams)
  await ethTx.save()

  return ethTx
}

async function bumpTxFee (ethTx) {
  const { gasPrice: currentGasPrice } = ethTx

  let fastPriceInWei
  try {
    const { data: gasPricesFromOracle } = await axios('https://www.etherchain.org/api/gasPriceOracle')
    const { fastest } = gasPricesFromOracle
    fastPriceInWei = parseInt(toWei(fastest, 'gwei'))
  } catch (e) {
    fastPriceInWei = currentGasPrice
  }

  if (fastPriceInWei > (currentGasPrice * 1.5)) {
    ethTx.gasPrice = Math.min(Math.ceil(fastPriceInWei), toWei('50', 'gwei'))
  } else {
    ethTx.gasPrice = Math.min(Math.ceil(currentGasPrice * 1.51), toWei('50', 'gwei'))
  }

  await ethTx.save()
}

async function sendTransaction (ethTx, instance, agenda, done, successCallback, errorCallback) {
  try {
    web3().eth.sendTransaction(ethTx.json())
      .on('transactionHash', async (transactionHash) => {
        console.log('transactionHash', transactionHash)
        await successCallback(transactionHash, ethTx, instance, agenda)
        done()
      })
      .on('error', async (error) => {
        console.log('web3 tx error')
        console.log(error)

        await handleWeb3TransactionError(error, ethTx, instance, agenda, done, successCallback, errorCallback)
      })
  } catch (error) {
    console.log('web3 try catch error')
    console.log(error)

    await handleWeb3TransactionError(error, ethTx, instance, agenda, done, successCallback, errorCallback)
  }
  done()
}

async function handleWeb3TransactionError (error, ethTx, instance, agenda, done, successCallback, errorCallback) {
  ethTx.error = error
  await ethTx.save()
  if ((String(error).indexOf('nonce too low') >= 0) || (String(error).indexOf('nonce is too low') >= 0) || (String(error).indexOf('There is another transaction with same nonce in the queue') >= 0)) {
    const ethTxsFailed = await EthTx.find({ failed: true, nonce: ethTx.nonce }).sort({ gasPrice: 'descending' }).exec()
    if (ethTxsFailed.length > 0) {
      ethTx.gasPrice = Math.ceil(ethTxsFailed[0].gasPrice * 1.51)
    } else {
      ethTx.nonce = ethTx.nonce + 1
    }
    await ethTx.save()
    await sendTransaction(ethTx, instance, agenda, done, successCallback, errorCallback)
  } else if (String(error).indexOf('account has nonce of') >= 0) {
    const [accountNonce, txNonce] = String(error)
      .split("Error: the tx doesn't have the correct nonce. account has nonce of: ")[1]
      .split(' tx has nonce of: ')
      .map(x => parseInt(x))

    console.log(`Account Nonce: ${accountNonce} | Tx Nonce: ${txNonce}`)

    ethTx.nonce = accountNonce
    await ethTx.save()
    await sendTransaction(ethTx, instance, agenda, done, successCallback, errorCallback)
  } else if ((String(error).indexOf('Transaction was not mined within') >= 0) || (String(error).indexOf('Insufficient funds') >= 0)) {
    const { from } = ethTx
    const txCount = await web3().eth.getTransactionCount(from)
    if (ethTx.nonce >= txCount) {
      ethTx.failed = true
      await ethTx.save()
    }
  } else if (String(error).indexOf('Transaction has been reverted by the EVM') >= 0) {
    console.log('Transaction has been reverted by the EVM')
    ethTx.failed = false
  } else if (String(error).indexOf('Transaction with the same hash was already imported') >= 0) {
    console.log('Transaction with the same hash was already imported')
  } else if (String(error).indexOf('transaction underpriced') >= 0) {
    console.log('transaction underpriced')
    console.log('ethTx', ethTx)
    ethTx.gasPrice = Math.ceil(ethTx.gasPrice * 1.51)
    await ethTx.save()
    await sendTransaction(ethTx, instance, agenda, done, successCallback, errorCallback)
  } else {
    ethTx.failed = true
    await ethTx.save()

    const agentUrl = getAgentUrl()

    bugsnagClient.metaData = {
      ethTx,
      instance,
      agentUrl
    }
    bugsnagClient.notify(error)

    await errorCallback(error, instance)
    handleError(error)
    done(error)
  }
}

module.exports = {
  setTxParams,
  bumpTxFee,
  sendTransaction,
  handleWeb3TransactionError
}

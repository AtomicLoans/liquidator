const axios = require('axios')
const { ensure0x } = require('@liquality/ethereum-utils')
const date = require('date.js')

const EthTx = require('../../../models/EthTx')
const LoanMarket = require('../../../models/LoanMarket')
const OracleUpdate = require('../../../models/OracleUpdate')
const { numToBytes32 } = require('../../../utils/finance')
const { getObject, getContract, loadObject } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { setTxParams, bumpTxFee, sendTransaction } = require('../utils/web3Transaction')
const handleError = require('../../../utils/handleError')
const web3 = require('../../../utils/web3')
const { hexToNumberString, fromWei, toWei } = web3().utils

function defineOracleJobs (agenda) {
  agenda.define('check-arbiter-oracle', async (job, done) => {
    console.log('check-arbiter-oracle')

    const { NETWORK } = process.env

    const loanMarket = await LoanMarket.findOne().exec()
    if (!loanMarket) return console.log('Error: LoanMarket not found')

    const { principalAddress: arbiterAddress } = await loanMarket.getAgentAddresses()

    const med = getObject('medianizer')

    if (NETWORK === 'mainnet') {
      for (let i = 0; i < 1; i++) {
        const oracleAddress = await med.methods.oracles(i).call()

        const oracle = loadObject('oracle', oracleAddress)
        const peek = await oracle.methods.peek().call()

        const oraclePriceInBytes32 = peek[0]
        const oraclePrice = parseFloat(fromWei(hexToNumberString(oraclePriceInBytes32), 'ether'))

        const { data } = await axios.get('https://api.kraken.com/0/public/Ticker?pair=XBTUSD')
        const btcPrice = parseFloat(data.result.XXBTZUSD.c[0])

        if ((Math.abs(1 - (btcPrice / oraclePrice)) * 100) > 1) {
          try {
            console.log('UPDATING ORACLES')

            const fundOracles = getObject('fundoracles')

            const payment = await fundOracles.methods.billWithEth(i).call()
            const paymentEth = await fundOracles.methods.paymentWithEth(i, payment).call()

            const txData = await fundOracles.methods.updateWithEth(i, payment, getContract('erc20', 'DAI')).encodeABI()

            const oracleUpdate = OracleUpdate.fromOracleUpdate(oraclePrice, btcPrice)
            await oracleUpdate.save()

            const ethTx = await setTxParams(txData, arbiterAddress, getContract('fundoracles'), oracleUpdate)

            ethTx.value = paymentEth
            await ethTx.save()

            console.log('ethTx', ethTx)

            await sendTransaction(ethTx, oracleUpdate, agenda, done, txSuccess, txFailure)
          } catch (e) {
            console.log('e', e)
          }
        }
      }
    } else {
      const peek = await med.methods.peek().call()

      const oraclePriceInBytes32 = peek[0]
      const oraclePrice = parseFloat(fromWei(hexToNumberString(oraclePriceInBytes32), 'ether'))

      const { data } = await axios.get('https://api.kraken.com/0/public/Ticker?pair=XBTUSD')
      const btcPrice = parseFloat(data.result.XXBTZUSD.c[0])

      if ((Math.abs(1 - (btcPrice / oraclePrice)) * 100) > 1) {
        const txData = med.methods.poke(ensure0x(numToBytes32(toWei(btcPrice.toString(), 'ether'))), true).encodeABI()

        const oracleUpdate = OracleUpdate.fromOracleUpdate(oraclePrice, btcPrice)
        await oracleUpdate.save()

        const ethTx = await setTxParams(txData, arbiterAddress, getContract('medianizer'), oracleUpdate)

        await sendTransaction(ethTx, oracleUpdate, agenda, done, txSuccess, txFailure)
      }
    }

    done()
  })

  agenda.define('verify-check-arbiter-oracle', async (job, done) => {
    try {
      const { data } = job.attrs
      const { oracleUpdateId } = data

      const oracleUpdate = await OracleUpdate.findOne({ _id: oracleUpdateId }).exec()
      if (!oracleUpdate) return console.log('Error: OracleUpdate not found')
      const { oracleUpdateTxHash } = OracleUpdate

      console.log('CHECKING RECEIPT')

      const receipt = await web3().eth.getTransactionReceipt(oracleUpdateTxHash)

      if (receipt === null) {
        console.log('RECEIPT IS NULL')

        const ethTx = await EthTx.findOne({ _id: oracleUpdate.ethTxId }).exec()
        if (!ethTx) return console.log('Error: EthTx not found')

        if (date(getInterval('BUMP_TX_INTERVAL')) > ethTx.updatedAt && oracleUpdate.status !== 'FAILED') {
          console.log('BUMPING TX FEE')

          await bumpTxFee(ethTx)
          await sendTransaction(ethTx, oracleUpdate, agenda, done, txSuccess, txFailure)
        } else {
          await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-check-arbiter-oracle', { oracleUpdateId })
        }
      } else if (receipt.status === false) {
        console.log('RECEIPT STATUS IS FALSE')
        console.log('TX WAS MINED BUT TX FAILED')
      } else {
        console.log('RECEIPT IS NOT NULL')

        console.log('SET')
        oracleUpdate.status = 'SET'
        await oracleUpdate.save()
        done()
      }

      done()
    } catch (e) {
      console.log('e', e)
    }
  })
}

async function txSuccess (transactionHash, ethTx, instance, agenda) {
  const oracleUpdate = instance

  oracleUpdate.ethTxId = ethTx.id
  oracleUpdate.oracleUpdateTxHash = transactionHash
  oracleUpdate.status = 'SETTING'
  oracleUpdate.save()
  console.log('SETTING')
  await agenda.now('verify-check-arbiter-oracle', { oracleUpdateId: oracleUpdate.id })
}

async function txFailure (error, instance) {
  const oracleUpdate = instance

  console.log('FAILED TO UPDATE ORACLE')
  oracleUpdate.status = 'FAILED'
  await oracleUpdate.save()

  handleError(error)
}

module.exports = {
  defineOracleJobs
}

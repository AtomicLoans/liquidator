const axios = require('axios')
const { ensure0x } = require('@liquality/ethereum-utils')
const date = require('date.js')
const BN = require('bignumber.js')

const EthTx = require('../../../models/EthTx')
const LoanMarket = require('../../../models/LoanMarket')
const OracleUpdate = require('../../../models/OracleUpdate')
const { numToBytes32 } = require('../../../utils/finance')
const { BlockchainInfo, CoinMarketCap, CryptoCompare, Gemini, BitBay, Bitstamp, Coinbase, CryptoWatch, Coinpaprika, Kraken } = require('../../../utils/getPrices')
const { getObject, getContract, loadObject } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { setTxParams, bumpTxFee, sendTransaction } = require('../utils/web3Transaction')
const handleError = require('../../../utils/handleError')
const web3 = require('../../../utils/web3')
const { hexToNumberString, fromWei, toWei } = web3().utils

const { getMedianBtcPrice } = require('../../../utils/getPrices')
const { getCurrentTime } = require('../../../utils/time')

const apis = [
  BlockchainInfo, CoinMarketCap, CryptoCompare, Gemini, BitBay, Bitstamp, Coinbase, CryptoWatch, Coinpaprika, Kraken
]

function defineOracleJobs (agenda) {
  agenda.define('check-liquidator-oracle', async (job, done) => {
    console.log('check-liquidator-oracle')

    const { NETWORK } = process.env

    const loanMarket = await LoanMarket.findOne().exec()
    if (!loanMarket) return console.log('Error: LoanMarket not found')

    const { principalAddress: arbiterAddress } = await loanMarket.getAgentAddresses()

    const med = getObject('medianizer')

    if (NETWORK === 'mainnet') {
      const currentTime = parseInt(await getCurrentTime())
      console.log('currentTime', currentTime)

      const medianBtcPrice = await getMedianBtcPrice()

      console.log('medianBtcPrice', medianBtcPrice)

      const medPeek = await med.methods.peek().call()
      const medPriceInBytes32 = medPeek[0]
      const medPrice = parseFloat(fromWei(hexToNumberString(medPriceInBytes32), 'ether'))
      console.log('medPrice', medPrice)

      const medHasPrice = medPeek[1]
      console.log('medHasPrice', medHasPrice)

      if ((Math.abs(1 - (medianBtcPrice / medPrice)) * 100) > 1 || !medHasPrice) {
        console.log('MEDIANIZER PRICE CHANGED')

        let oracles = []

        for (let i = 0; i < 10; i++) {
          const oracle = {}

          const oracleAddress = await med.methods.oracles(i).call()

          const oracleContract = loadObject('oracle', oracleAddress)

          const expiry = await oracleContract.methods.expiry().call()
          const timeout = await oracleContract.methods.timeout().call()
          const peek = await oracleContract.methods.peek().call()

          const oraclePriceInBytes32 = peek[0]
          const oraclePrice = parseFloat(fromWei(hexToNumberString(oraclePriceInBytes32), 'ether'))

          let btcPrice = medianBtcPrice
          try {
            btcPrice = await apis[i]()
            console.log('btcPrice', btcPrice)

            oracle.priceChange = Math.abs(1 - (btcPrice / oraclePrice)) * 100
          } catch (e) {
            oracle.priceChange = 1.001
          }

          oracle.index = i
          oracle.pastExpiry = currentTime > parseInt(expiry)
          oracle.pastTimeout = currentTime > parseInt(timeout)
          oracle.oraclePrice = oraclePrice
          oracle.btcPrice = btcPrice
          oracle.currentTime = currentTime
          oracle.expiry = expiry
          oracle.timeout = timeout

          oracles.push(oracle)
        }

        oracles = oracles.sort((a, b) => b.priceChange - a.priceChange)

        const numExpired = oracles.filter(x => x.pastExpiry).length
        const numOutOfDate = oracles.filter(x => x.priceChange > 1 && x.pastTimeout).length

        console.log('oracles', oracles)
        console.log('numExpired', numExpired)
        console.log('numOutOfDate', numOutOfDate)

        if (!medHasPrice || (numExpired > 5 && numOutOfDate > 0)) {
          oracles = oracles.filter(x => (x.pastExpiry || x.priceChange > 1) && x.pastTimeout)
        } else {
          oracles = oracles.filter(x => x.priceChange > 1 && x.pastTimeout)
        }

        console.log('oracles', oracles)

        for (let k = 0; k < oracles.length; k++) {
          const oracle = oracles[k]
          const { index, oraclePrice, btcPrice } = oracle

          try {
            console.log('UPDATING ORACLES')

            const fundOracles = getObject('fundoracles')

            const payment = await fundOracles.methods.billWithEth(index).call()
            const paymentEth = await fundOracles.methods.paymentWithEth(index, payment).call()

            const txData = await fundOracles.methods.updateWithEth(index, payment, getContract('erc20', 'DAI')).encodeABI()

            const oracleUpdate = OracleUpdate.fromOracleUpdate(oraclePrice, btcPrice)
            await oracleUpdate.save()

            const ethTx = await setTxParams(txData, arbiterAddress, getContract('fundoracles'), oracleUpdate)

            ethTx.value = index < 5 ? BN(paymentEth).plus(10e12).toString() : paymentEth
            ethTx.gasLimit = 1500000
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

  agenda.define('verify-check-liquidator-oracle', async (job, done) => {
    try {
      const { data } = job.attrs
      const { oracleUpdateId } = data

      const oracleUpdate = await OracleUpdate.findOne({ _id: oracleUpdateId }).exec()
      if (!oracleUpdate) return console.log('Error: OracleUpdate not found')
      const { oracleUpdateTxHash } = oracleUpdate

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
          await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-check-liquidator-oracle', { oracleUpdateId })
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
  await agenda.now('verify-check-liquidator-oracle', { oracleUpdateId: oracleUpdate.id })
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

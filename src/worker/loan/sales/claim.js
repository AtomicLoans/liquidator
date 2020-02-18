const axios = require('axios')
const Sale = require('../../../models/Sale')
const handleError = require('../../../utils/handleError')

function defineSalesClaimJobs (agenda) {
  agenda.define('verify-collateral-claim', async (job, done) => {
    // THIS JOB IS ONLY DONE BY THE LENDER AGENT

    console.log('verify-collateral-claim')

    const { data } = job.attrs
    const { saleModelId } = data
    const { NETWORK } = process.env

    const sale = await Sale.findOne({ _id: saleModelId }).exec()
    if (!sale) return console.log('Error: Sale not found')
    const { initTxHash } = sale

    console.log('initTxHash', initTxHash)

    if (NETWORK === 'mainnet' || NETWORK === 'kovan') {
      let baseUrl
      if (NETWORK === 'mainnet') {
        baseUrl = 'https://blockstream.info'
      } else {
        baseUrl = 'https://blockstream.info/testnet'
      }
      try {
        console.log(`${baseUrl}/api/tx/${initTxHash}/outspend/0`)
        const { status, data: spendInfo } = await axios.get(`${baseUrl}/api/tx/${initTxHash}/outspend/0`)

        if (status === 200) {
          if (spendInfo.spent === true) {
            console.log('COLLATERAL_CLAIMED FOUND')
            sale.claimTxHash = spendInfo.txid
            sale.status = 'COLLATERAL_CLAIMED'
          }
        }
      } catch (e) {
        handleError(e)
      }
    } else {
      const collateralBlockHeight = await sale.collateralClient().chain.getBlockHeight()
      const { latestCollateralBlock } = sale
      let curBlock = latestCollateralBlock + 1

      while (curBlock <= collateralBlockHeight) {
        const block = await sale.collateralClient().chain.getBlockByNumber(curBlock)
        const txs = await Promise.all(block.transactions.map((txid) => {
          return sale.collateralClient().getMethod('getTransactionByHash')(txid)
        }))

        for (let i = 0; i < txs.length; i++) {
          const tx = txs[i]
          const vins = tx._raw.vin
          for (let j = 0; j < vins.length; j++) {
            const vin = vins[j]
            if (vin.txid === initTxHash) {
              console.log('COLLATERAL_CLAIMED FOUND')
              sale.claimTxHash = tx.hash
              sale.status = 'COLLATERAL_CLAIMED'
              curBlock = collateralBlockHeight + 1
              break
            }
          }
        }

        curBlock++
      }

      sale.latestCollateralBlock = collateralBlockHeight
    }

    await sale.save()

    done()
  })
}

module.exports = {
  defineSalesClaimJobs
}

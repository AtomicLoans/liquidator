const axios = require('axios')
const { sha256 } = require('@liquality/crypto')
const compareVersions = require('compare-versions')
const Sale = require('../../../models/Sale')
const Loan = require('../../../models/Loan')
const LoanMarket = require('../../../models/LoanMarket')
const Secret = require('../../../models/Secret')
const { numToBytes32 } = require('../../../utils/finance')
const { getObject } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { getLockArgs } = require('../utils/collateral')
const { getInitArgs } = require('../utils/collateralSwap')
const { isArbiter } = require('../../../utils/env')
const { getEndpoint } = require('../../../utils/endpoints')
const handleError = require('../../../utils/handleError')
const { remove0x } = require('@liquality/ethereum-utils')

function defineSalesClaimJobs (agenda) {
  agenda.define('claim-collateral', async (job, done) => {

    try {
      const { data } = job.attrs
      const { saleModelId } = data

      const sale = await Sale.findOne({ _id: saleModelId }).exec()
      const { principal, collateral, secretB, secretC, secretHashD, initTxHash, saleId } = sale

      const loanMarket = await LoanMarket.findOne({ principal, collateral }).exec()

      const loan = await Loan.findOne({ _id: sale.loan }).exec()
      const { loanId } = loan

      const swapParams = await getInitArgs(numToBytes32(loanId), numToBytes32(saleId), principal, collateral)

      const secretModel = await Secret.findOne({ secretHash: remove0x(secretHashD) }).exec()
      const { secret: secretD } = secretModel

      const secrets = [remove0x(secretB), remove0x(secretC), secretD]

      const { collateralPublicKey: liquidatorPubKey } = await loanMarket.getAgentAddresses()

      let pubKeys = swapParams[0]
      pubKeys.liquidatorPubKey = liquidatorPubKey

      const claimTxHash = await sale.collateralClient().loan.collateralSwap.claim(initTxHash, swapParams[0], secrets, swapParams[1], swapParams[2])
      console.log('claimTxHash', claimTxHash)
    } catch(e) {
      console.log('e', e)
    }

    done()

  })
}

module.exports = {
  defineSalesClaimJobs
}

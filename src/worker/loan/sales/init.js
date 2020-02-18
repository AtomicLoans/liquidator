const axios = require('axios')
const { sha256 } = require('@liquality/crypto')
const compareVersions = require('compare-versions')
const Sale = require('../../../models/Sale')
const Loan = require('../../../models/Loan')
const Secret = require('../../../models/Secret')
const { numToBytes32 } = require('../../../utils/finance')
const { getObject } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { getLockArgs } = require('../utils/collateral')
const { getInitArgs } = require('../utils/collateralSwap')
const { isArbiter } = require('../../../utils/env')
const { getEndpoint } = require('../../../utils/endpoints')
const handleError = require('../../../utils/handleError')

const web3 = require('web3')
const { hexToNumber } = web3.utils

function defineSalesInitJobs (agenda) {
  agenda.define('init-liquidation', async (job, done) => {
    console.log('init-liquidation')

    try {
      const { data } = job.attrs
      const { loanModelId, lenderSigs } = data

      const loan = await Loan.findOne({ _id: loanModelId }).exec()
      const { loanId, principal, collateral } = loan

      const sales = getObject('sales', principal)

      const next = await sales.methods.next(numToBytes32(loanId)).call()
      const saleIndexByLoan = next - 1
      const saleIdBytes32 = await sales.methods.saleIndexByLoan(numToBytes32(loanId), saleIndexByLoan).call()
      const saleId = hexToNumber(saleIdBytes32)

      const swapParams = await getInitArgs(numToBytes32(loanId), numToBytes32(saleId), principal, collateral)
      const initAddresses = await loan.collateralClient().loan.collateralSwap.getInitAddresses(...swapParams)
      const { refundableAddress: refundableSwapAddress, seizableAddress: seizableSwapAddress } = initAddresses

      const lockArgs = await getLockArgs(numToBytes32(loanId), principal, collateral)
      const lockAddresses = await loan.collateralClient().loan.collateral.getLockAddresses(...lockArgs)

      const refundableUnspent = await loan.collateralClient().getMethod('getUnspentTransactions')([lockAddresses.refundableAddress])

      if (refundableUnspent.length > 0) {
        const lockTxHash = refundableUnspent[0].txid
        const party = isArbiter() ? 'arbiter' : 'lender'

        let outputs
        if (isArbiter()) {
          outputs = [{ address: initAddresses.refundableAddress }, { address: initAddresses.seizableAddress }]
        } else {
          outputs = [{ address: initAddresses.refundableAddress }, { address: initAddresses.seizableAddress }]
        }

        const exampleRSSigValue = '0000000000000000000000000000000000000000000000000000000000000000'
        const exampleSig = `30440220${exampleRSSigValue}0220${exampleRSSigValue}01`

        const multisigParams = [lockTxHash, ...lockArgs, party, outputs]
        console.log('multisigParams', multisigParams)
        const agentSigs = await loan.collateralClient().loan.collateral.multisigSign(...multisigParams)

        let sigs
        if (isArbiter()) {
          sigs = {
            refundable: [Buffer.from(lenderSigs.refundableSig, 'hex'), Buffer.from(agentSigs.refundableSig, 'hex')],
            seizable: [Buffer.from(lenderSigs.seizableSig, 'hex'), Buffer.from(agentSigs.seizableSig, 'hex')]
          }

          console.log('arbiterSigs', sigs)
        } else {
          sigs = {
            refundable: [Buffer.from(agentSigs.refundableSig, 'hex'), Buffer.from(exampleSig, 'hex')],
            seizable: [Buffer.from(agentSigs.seizableSig, 'hex'), Buffer.from(exampleSig, 'hex')]
          }

          console.log('lenderSigs', sigs)
        }

        console.log('lockTxHash, sigs, ...lockArgs, outputs', lockTxHash, sigs, ...lockArgs, outputs)
        const multisigSendTxRaw = await loan.collateralClient().loan.collateral.multisigBuild(lockTxHash, sigs, ...lockArgs, outputs)
        console.log('multisigSendTxRaw', multisigSendTxRaw)

        const { secretHashB, secretHashC } = await sales.methods.secretHashes(numToBytes32(saleId)).call()

        const saleParams = { refundableSwapAddress, seizableSwapAddress, secretHashB, secretHashC, saleIndexByLoan, saleId, principal, collateral, loanModelId }
        const sale = Sale.fromParams(saleParams)
        sale.loan = loan

        await sale.save()

        console.log('STARTING INIT')

        const multisigSendTx = await loan.collateralClient().getMethod('decodeRawTransaction')(multisigSendTxRaw)
        const multisigSendVouts = multisigSendTx._raw.data.vout

        let refundableAmount, seizableAmount
        if (multisigSendVouts[0].scriptPubKey.addresses[0] === refundableSwapAddress) {
          refundableAmount = multisigSendVouts[0].value
          seizableAmount = multisigSendVouts[1].value
        } else {
          refundableAmount = multisigSendVouts[1].value
          seizableAmount = multisigSendVouts[0].value
        }

        sale.collateralSwapRefundableAmount = refundableAmount
        sale.collateralSwapSeizableAmount = seizableAmount
        await sale.save()

        if (isArbiter()) {
          try {
            const txHash = await loan.collateralClient().chain.sendRawTransaction(multisigSendTxRaw)
            console.log('txHash', txHash)

            sale.initTxHash = txHash
            sale.status = 'COLLATERAL_SENDING'
          } catch (e) {
            handleError(e)

            console.log('ERROR FIRST ATTEPT TO SEND COLLATERAL')
            console.log(e)

            const sigsReverse = {
              refundable: [Buffer.from(agentSigs.refundableSig, 'hex'), Buffer.from(lenderSigs.refundableSig, 'hex')],
              seizable: [Buffer.from(agentSigs.seizableSig, 'hex'), Buffer.from(lenderSigs.seizableSig, 'hex')]
            }

            const multisigSendReverseTxRaw = await loan.collateralClient().loan.collateral.multisigBuild(lockTxHash, sigsReverse, ...lockArgs, outputs)
            console.log('multisigSendReverseTxRaw', multisigSendReverseTxRaw)

            const txHash = await loan.collateralClient().chain.sendRawTransaction(multisigSendReverseTxRaw)
            console.log('alternate txHash', txHash)

            sale.initTxHash = txHash
            sale.status = 'COLLATERAL_SENDING'
          }
        } else {
          console.log(`${getEndpoint('ARBITER_ENDPOINT')}/sales/new`)
          console.log({ principal, loanId, lenderSigs: agentSigs, refundableAmount, seizableAmount })
          await axios.post(`${getEndpoint('ARBITER_ENDPOINT')}/sales/new`, { principal, loanId, lenderSigs: agentSigs, refundableAmount, seizableAmount })
        }

        const latestCollateralBlock = await loan.collateralClient().getMethod('getBlockHeight')()
        sale.latestCollateralBlock = latestCollateralBlock
        await sale.save()

        console.log('saving sale', sale)

        await sale.save()

        await agenda.schedule(getInterval('CHECK_BTC_TX_INTERVAL'), 'verify-init-liquidation', { saleModelId: sale.id })
      } else {
        // TODO: make sure this doesn't keep running
        const saleExists = await Sale.findOne({ loanModelId }).exec()
        if (saleExists) {
          saleExists.status = 'FAILED'
          await saleExists.save()
        } else {
          const sale = new Sale()
          sale.loanModelId = loanModelId
          sale.status = 'FAILED'
          await sale.save()
        }

        console.log('CANNOT START LIQUIDATION BECAUSE COLLATERAL DOESN\'T EXIST')
      }
      done()
    } catch (e) {
      handleError(e)
      console.log(e)
      done()
    }
  })

  agenda.define('verify-init-liquidation', async (job, done) => {
    try {
      const { data } = job.attrs
      const { saleModelId } = data

      const sale = await Sale.findOne({ _id: saleModelId }).exec()
      if (!sale) return console.log('Error: Sale not found')
      const { saleId, principal } = sale

      if (!isArbiter() && !sale.initTxHash) {
        let safePrincipal = principal
        if (principal === 'SAI') {
          const { data: versionData } = await axios.get(`${getEndpoint('ARBITER_ENDPOINT')}/version`)
          const { version } = versionData

          if (!compareVersions(version, '0.1.31', '>')) {
            safePrincipal = 'DAI'
          }
        }

        const { data: arbiterSale } = await axios.get(`${getEndpoint('ARBITER_ENDPOINT')}/sales/contract/${safePrincipal}/${saleId}`)
        sale.initTxHash = arbiterSale.initTxHash
      }

      const { initTxHash, collateralSwapRefundableP2SHAddress, collateralSwapSeizableP2SHAddress, collateralSwapRefundableAmount, collateralSwapSeizableAmount } = sale

      if (!isArbiter() && initTxHash) {
        sale.status = 'COLLATERAL_SENDING'
      }

      const [refundableBalance, seizableBalance, refundableUnspent, seizableUnspent] = await Promise.all([
        sale.collateralClient().chain.getBalance([collateralSwapRefundableP2SHAddress]),
        sale.collateralClient().chain.getBalance([collateralSwapSeizableP2SHAddress]),
        sale.collateralClient().getMethod('getUnspentTransactions')([collateralSwapRefundableP2SHAddress]),
        sale.collateralClient().getMethod('getUnspentTransactions')([collateralSwapSeizableP2SHAddress])
      ])

      const collateralRequirementsMet = (refundableBalance.toNumber() >= collateralSwapRefundableAmount && seizableBalance.toNumber() >= collateralSwapSeizableAmount)
      const refundableConfirmationRequirementsMet = refundableUnspent.length === 0 ? false : refundableUnspent[0].confirmations > 0
      const seizableConfirmationRequirementsMet = seizableUnspent.length === 0 ? false : seizableUnspent[0].confirmations > 0

      if (collateralRequirementsMet && refundableConfirmationRequirementsMet && seizableConfirmationRequirementsMet) {
        console.log('COLLATERAL SENT')
        sale.status = 'COLLATERAL_SENT'

        if (isArbiter()) {
          const secretModel = await Secret.findOne({ secretHash: sale.secretHashC }).exec()
          const { secret } = secretModel

          if (sha256(secret) === sale.secretHashC) {
            console.log('ARBITER SECRET MATCHES')
            sale.secretC = secret
            sale.status = 'SECRETS_PROVIDED'
          } else {
            console.log('ARBITER SECRET DOESN\'T MATCH')
            console.log('secret', secret)
            console.log('sale', sale)
          }
        } else {
          const { loanModelId } = sale

          const loan = await Loan.findOne({ _id: loanModelId }).exec()
          const secret = loan.lenderSecrets[1]

          if (sha256(secret) === sale.secretHashB) {
            console.log('LENDER SECRET MATCHES')
            sale.secretB = secret
            sale.status = 'SECRETS_PROVIDED'
          } else {
            console.log('LENDER SECRET DOESN\'T MATCH')
            console.log('secret', secret)
            console.log('sale', sale)
          }
        }
      } else {
        await agenda.schedule(getInterval('CHECK_BTC_TX_INTERVAL'), 'verify-init-liquidation', { saleModelId })
      }

      await sale.save()

      done()
    } catch (e) {
      handleError(e)
      console.log('VERIFY-INIT-ERROR')
      console.log(e)
      done()
    }
  })
}

module.exports = {
  defineSalesInitJobs
}

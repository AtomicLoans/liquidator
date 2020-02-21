const Loan = require('../../../models/Loan')
const Sale = require('../../../models/Sale')
const LoanMarket = require('../../../models/LoanMarket')
const EthTx = require('../../../models/EthTx')
const Secret = require('../../../models/Secret')
const { numToBytes32 } = require('../../../utils/finance')
const { getObject, getContract } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { ensure0x } = require('@liquality/ethereum-utils')
const { hash160, sha256 } = require('@liquality/crypto')
const { setTxParams, bumpTxFee, sendTransaction } = require('../utils/web3Transaction')
const handleError = require('../../../utils/handleError')
const web3 = require('../../../utils/web3')
const { getInitArgs } = require('../utils/collateralSwap')
const date = require('date.js')
const keccak256 = require('keccak256')

const { hexToNumber } = web3().utils

function defineLoanLiquidateJobs (agenda) {
  agenda.define('liquidate-loan', async (job, done) => {
    const { data } = job.attrs
    const { loanModelId } = data

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    if (!loan) return console.log('Error: Loan not found')

    const { loanId, principal, lenderPrincipalAddress, borrowerPrincipalAddress } = loan

    const loanMarket = await LoanMarket.findOne({ principal }).exec()
    const { principalAddress, collateralPublicKey } = await loanMarket.getAgentAddresses()
    const collateralPubKeyHash = hash160(collateralPublicKey)

    const loans = getObject('loans', principal)
    const sales = getObject('sales', principal)

    const message = `You are signing with ${principalAddress} to Liquidate ${principal} Loan #${loanId} with Borrower ${borrowerPrincipalAddress} and Lender ${lenderPrincipalAddress} on Contract ${loans._address}`

    const nextSale = await sales.methods.next(numToBytes32(loanId)).call()

    const secrets = await loanMarket.collateralClient().loan.secrets.generateSecrets(message, 3)
    const secret = secrets[nextSale]
    const secretHash = sha256(secret)

    const secretModel = Secret.fromSecretParams(secret, secretHash, message, 0, loanId)
    await secretModel.save()

    const txData = loans.methods.liquidate(numToBytes32(loanId), ensure0x(secretHash), ensure0x(collateralPubKeyHash)).encodeABI()
    const ethTx = await setTxParams(txData, ensure0x(principalAddress), getContract('loans', principal), loan)
    await sendTransaction(ethTx, loan, agenda, done, txSuccess, txFailure)
  })

  agenda.define('verify-liquidate-loan', async (job, done) => {
    const { data } = job.attrs
    const { loanModelId } = data

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    if (!loan) return console.log('Error: Loan not found')
    const { liquidationTxHash } = loan

    console.log('CHECKING LOAN LIQUIDATION')

    const receipt = await web3().eth.getTransactionReceipt(liquidationTxHash)

    if (receipt === null) {
      console.log('RECEIPT IS NULL')

      const ethTx = await EthTx.findOne({ _id: loan.ethTxId }).exec()
      if (!ethTx) return console.log('Error: EthTx not found')

      if (date(getInterval('BUMP_TX_INTERVAL')) > ethTx.updatedAt && loan.status !== 'FAILED') {
        console.log('BUMPING TX FEE')

        await bumpTxFee(ethTx)
        await sendTransaction(ethTx, loan, agenda, done, txSuccess, txFailure)
      } else {
        await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-liquidate-loan', { loanModelId })
      }
    } else if (receipt.status === false) {
      console.log('RECEIPT STATUS IS FALSE')
      console.log('TX WAS MINED BUT TX FAILED')
    } else {
      console.log('RECEIPT IS NOT NULL')

      const saleCreateLog = receipt.logs.filter(log => log.topics[0] === ensure0x(keccak256('Create(bytes32)').toString('hex')))

      if (saleCreateLog.length > 0) {
        console.log('EXISTS')
        const { data: sale } = saleCreateLog[0]

        const saleId = hexToNumber(sale)

        const { loanId, principal, collateral } = loan

        const sales = getObject('sales', principal)

        const saleIndexByLoan = loan.loanId

        const { secretHashB, secretHashC, secretHashD } = await sales.methods.secretHashes(sale).call()

        const settlementExpiration = await sales.methods.settlementExpiration(sale).call()

        const swapParams = await getInitArgs(numToBytes32(loanId), numToBytes32(saleId), principal, collateral)
        console.log('swapParams', swapParams)
        const initAddresses = await loan.collateralClient().loan.collateralSwap.getInitAddresses(...swapParams)

        const { refundableAddress: refundableSwapAddress, seizableAddress: seizableSwapAddress } = initAddresses

        const saleParams = { refundableSwapAddress, seizableSwapAddress, secretHashB, secretHashC, saleIndexByLoan, saleId, principal, collateral, loanModelId }
        const saleModel = Sale.fromParams(saleParams)
        saleModel.loan = loan
        saleModel.secretHashD = secretHashD
        saleModel.settlementExpiration = settlementExpiration

        await saleModel.save()

        console.log('saleModel', saleModel)

        console.log(`${principal} SALE ${saleId} CREATED`)

        console.log('LIQUIDATION INITIATED')
        loan.status = 'LIQUIDATED'
        await loan.save()
        done()
      } else {
        console.log('DOESN\'T EXIST')
        console.error('Error: Sale Id could not be found in transaction logs')
      }
      done()
    }

    done()
  })
}

async function txSuccess (transactionHash, ethTx, instance, agenda) {
  const loan = instance

  loan.ethTxId = ethTx.id
  loan.liquidationTxHash = transactionHash
  loan.status = 'LIQUIDATING'
  loan.save()
  console.log('LIQUIDATING')
  await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-liquidate-loan', { loanModelId: loan.id })
}

async function txFailure (error, instance) {
  console.log('LIQUIDATION FAILED')

  const loan = instance

  loan.status = 'FAILED'
  await loan.save()

  handleError(error)
}

module.exports = {
  defineLoanLiquidateJobs
}

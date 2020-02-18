const { ensure0x } = require('@liquality/ethereum-utils')
const { sha256 } = require('@liquality/crypto')
const date = require('date.js')

const EthTx = require('../../../models/EthTx')
const LoanMarket = require('../../../models/LoanMarket')
const Secret = require('../../../models/Secret')
const Secrets = require('../../../models/Secrets')
const { getObject, getContract } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { setTxParams, bumpTxFee, sendTransaction } = require('../utils/web3Transaction')
const handleError = require('../../../utils/handleError')
const web3 = require('../../../utils/web3')

function defineArbiterSecretsJobs (agenda) {
  agenda.define('add-secrets-hashes', async (job, done) => {
    const { data } = job.attrs
    const { loanMarketId } = data

    const loanMarket = await LoanMarket.findOne({ _id: loanMarketId }).exec()
    if (!loanMarket) return console.log('Error: LoanMarket not found')

    const { principal, secretIndex } = loanMarket
    const { principalAddress: lenderAddress } = await loanMarket.getAgentAddresses()

    const funds = getObject('funds', principal)

    const secretHashesCount = await funds.methods.secretHashesCount(lenderAddress).call()

    const message = `${lenderAddress}-${principal}-atomic-loans-${secretIndex}`

    const secrets = await loanMarket.collateralClient().loan.secrets.generateSecrets(message, parseInt(getInterval('LOAN_SECRET_HASH_COUNT')) * 4)

    const secretsModel = Secrets.fromSecretHashesCount(secretHashesCount)
    await secretsModel.save()

    const secretHashes = await Promise.all(secrets.map((secret, i) => {
      const secretHash = sha256(secret)
      const secretModel = Secret.fromSecretParams(secret, secretHash, message, i, secretHashesCount + i)
      secretModel.save()
      return ensure0x(secretHash)
    }))

    const txData = funds.methods.generate(secretHashes).encodeABI()

    const ethTx = await setTxParams(txData, lenderAddress, getContract('funds', principal), secretsModel)

    secretsModel.principal = principal
    secretsModel.ethTxId = ethTx.id
    await secretsModel.save()

    const instance = { secretsModel, loanMarket }
    await sendTransaction(ethTx, instance, agenda, done, txSuccess, txFailure)
  })

  agenda.define('verify-add-secret-hashes', async (job, done) => {
    const { data } = job.attrs
    const { loanMarketId, secretsModelId } = data

    const secretsModel = await Secrets.findOne({ _id: secretsModelId }).exec()
    if (!secretsModel) return console.log('Error: SecretsModel not found')
    const { generateTxHash } = secretsModel

    console.log('CHECKING RECEIPT')

    const receipt = await web3().eth.getTransactionReceipt(generateTxHash)

    if (receipt === null) {
      console.log('RECEIPT IS NULL')

      const ethTx = await EthTx.findOne({ _id: secretsModel.ethTxId }).exec()
      if (!ethTx) return console.log('Error: EthTx not found')

      if (date(getInterval('BUMP_TX_INTERVAL')) > ethTx.updatedAt && secretsModel.status !== 'FAILED') {
        console.log('BUMPING TX FEE')

        const loanMarket = await LoanMarket.findOne({ _id: loanMarketId }).exec()
        if (!loanMarket) return console.log('Error: LoanMarket not found')

        await bumpTxFee(ethTx)
        const instance = { secretsModel, loanMarket }
        await sendTransaction(ethTx, instance, agenda, done, txSuccess, txFailure)
      } else {
        await agenda.schedule(getInterval('SECRETS_BUMP_TX_INTERVAL'), 'verify-add-secret-hashes', { loanMarketId, secretsModelId })
      }
    } else if (receipt.status === false) {
      console.log('RECEIPT STATUS IS FALSE')
      console.log('TX WAS MINED BUT TX FAILED')
    } else {
      console.log('RECEIPT IS NOT NULL')

      console.log('GENERATED')
      secretsModel.status = 'GENERATED'
      await secretsModel.save()
      done()
    }

    done()
  })
}

async function txSuccess (transactionHash, ethTx, instance, agenda) {
  const { secretsModel, loanMarket } = instance

  secretsModel.ethTxId = ethTx.id
  secretsModel.generateTxHash = transactionHash
  secretsModel.status = 'GENERATING'
  secretsModel.save()
  console.log('GENERATING')
  await agenda.now('verify-add-secret-hashes', { secretsModelId: secretsModel.id, loanMarketId: loanMarket.id })
}

async function txFailure (error, instance) {
  const { secretsModel } = instance

  console.log('FAILED TO GENERATE')
  secretsModel.status = 'FAILED'
  await secretsModel.save()

  handleError(error)
}

module.exports = {
  defineArbiterSecretsJobs
}

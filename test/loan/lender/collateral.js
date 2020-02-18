/* eslint-env mocha */
const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')
const BN = require('bignumber.js')
const toSecs = require('@mblackmblack/to-seconds')
const bitcoin = require('bitcoinjs-lib')
const { ensure0x, remove0x } = require('@liquality/ethereum-utils')
const { generateMnemonic } = require('bip39')
const { sha256 } = require('@liquality/crypto')
const { sleep } = require('@liquality/utils')
const isCI = require('is-ci')

const { chains, importBitcoinAddresses, importBitcoinAddressesByAddress, fundUnusedBitcoinAddress, rewriteEnv, connectMetaMask } = require('../../common')
const { fundArbiter, fundAgent, generateSecretHashesArbiter, getLockParams, getTestContract, getTestObject, cancelLoans, fundWeb3Address, cancelJobs, restartJobs, removeFunds, removeLoans, increaseTime } = require('../loanCommon')
const { getWeb3Address } = require('../util/web3Helpers')
const { currencies } = require('../../../src/utils/fx')
const { numToBytes32 } = require('../../../src/utils/finance')
const { testLoadObject } = require('../util/contracts')
const { createCustomFund } = require('../setup/fundSetup')
const web3 = require('web3')

const { toWei } = web3.utils

chai.should()
const expect = chai.expect

chai.use(chaiHttp)
chai.use(chaiAsPromised)

const server = 'http://localhost:3030/api/loan'
const arbiterServer = 'http://localhost:3032/api/loan'

const arbiterChain = chains.web3WithArbiter

function testCollateral (web3Chain, ethNode, btcChain) {
  describe('Collateral Tests', () => {
    it('should POST loanMarket details and return loan details', async () => {
      await createCustomFund(web3Chain, arbiterChain, 200, 'SAI') // Create Custom Loan Fund with 200 SAI

      const principal = 'SAI'
      const collateral = 'BTC'
      const principalAmount = 25
      const loanDuration = toSecs({ days: 2 })

      const { status: requestsStatus, body: requestsBody } = await chai.request(server).post('/loans/new').send({ principal, collateral, principalAmount, loanDuration })

      expect(requestsStatus).to.equal(200)
      requestsBody.should.be.a('object')

      const { id: requestId, lenderPrincipalAddress, lenderCollateralPublicKey, minimumCollateralAmount, requestCreatedAt } = requestsBody

      const borrowerPrincipalAddress = await getWeb3Address(web3Chain)

      const { address, publicKey: borrowerCollateralPublicKey } = await btcChain.client.wallet.getUnusedAddress()
      const collateralValue = Math.floor(BN(minimumCollateralAmount).times(currencies[collateral].multiplier).times(1.2).toNumber())

      const currentTime = Date.now()

      const data = Buffer.from(`${borrowerPrincipalAddress} ${principalAmount} ${currentTime}`, 'utf8')
      const dataScript = bitcoin.payments.embed({ data: [data] })

      const proofOfFundsTxHex = await btcChain.client.chain.buildBatchTransaction([{ to: address, value: collateralValue }, { to: dataScript.output, value: 0 }])

      const secretData = [
        toWei(principalAmount.toString(), currencies[principal].unit), // Principal Value
        principal, // Principal
        collateralValue, // Collateral Value
        collateral, // Collateral
        borrowerPrincipalAddress, // Borrower Principal Address
        lenderPrincipalAddress, // Lender Principal Address
        borrowerCollateralPublicKey, // Borrower Collateral PubKey
        lenderCollateralPublicKey, // Lender Collateral PubKey
        requestCreatedAt // Fund Id as number
      ]

      const secretMsg = secretData.join('')
      const secrets = await btcChain.client.loan.secrets.generateSecrets(secretMsg, 4)
      const secretHashes = secrets.map(secret => sha256(secret))

      const { status: requestsIdStatus, body: requestsIdBody } = await chai.request(server).post(`/loans/${requestId}/proof_of_funds`).send({
        proofOfFundsTxHex, borrowerSecretHashes: secretHashes, borrowerPrincipalAddress, borrowerCollateralPublicKey: borrowerCollateralPublicKey.toString('hex')
      })
      const {
        collateralAmount: collateralAmountActual, borrowerPrincipalAddress: borrowerPrincipalAddressActual, borrowerCollateralPublicKey: borrowerCollateralPublicKeyActual
      } = requestsIdBody

      expect(requestsIdStatus).to.equal(200)
      requestsIdBody.should.be.a('object')
      expect(BN(collateralAmountActual).times(currencies[collateral].multiplier).toNumber()).to.equal(collateralValue)
      expect(borrowerPrincipalAddressActual).to.equal(borrowerPrincipalAddress)
      expect(borrowerCollateralPublicKeyActual).to.equal(borrowerCollateralPublicKey.toString('hex'))

      let requested = false
      while (!requested) {
        await sleep(5000)
        const { body: requestedBody } = await chai.request(server).get(`/loans/${requestId}`)
        const { status } = requestedBody
        console.log(status)
        if (status === 'AWAITING_COLLATERAL') requested = true
      }

      const { body: requestedBody } = await chai.request(server).get(`/loans/${requestId}`)

      const { loanId, refundableCollateralAmount, seizableCollateralAmount, collateralRefundableP2SHAddress, collateralSeizableP2SHAddress } = requestedBody

      const values = {
        refundableValue: BN(refundableCollateralAmount).times(currencies[collateral].multiplier).toNumber(),
        seizableValue: BN(seizableCollateralAmount).times(currencies[collateral].multiplier).toNumber()
      }

      await importBitcoinAddressesByAddress([collateralRefundableP2SHAddress, collateralSeizableP2SHAddress])

      const loans = await getTestObject(web3Chain, 'loans', principal)
      const approvedBefore = await loans.methods.approved(numToBytes32(loanId)).call()
      expect(approvedBefore).to.equal(false)

      const funded = await loans.methods.funded(numToBytes32(loanId)).call()
      expect(funded).to.equal(true)

      await secondsCountDown(4)

      const expectedAwaitingCollateralStatus = await getLoanStatus(requestId)
      expect(expectedAwaitingCollateralStatus).to.equal('AWAITING_COLLATERAL')

      const lockParams = await getLockParams(web3Chain, principal, values, loanId)
      const lockTxHash = await btcChain.client.loan.collateral.lock(...lockParams)

      const balance = await btcChain.client.chain.getBalance([collateralRefundableP2SHAddress, collateralSeizableP2SHAddress])
      console.log('balance', balance)

      await secondsCountDown(4)

      console.log('Mine BTC Block')
      await chains.bitcoinWithNode.client.chain.generateBlock(1)

      await secondsCountDown(60)

      const { body: loanMarketsAfterLocking } = await chai.request(server).get('/loanmarketinfo')
      const loanMarketAfterLocking = loanMarketsAfterLocking.find(loanMarket => loanMarket.principal === principal)
      const { totalCollateralValue: totalCollateralValueAfterLocking } = loanMarketAfterLocking
      expect(totalCollateralValueAfterLocking).to.equal(values.refundableValue + values.seizableValue)

      const approvedAfter = await loans.methods.approved(numToBytes32(loanId)).call()
      expect(approvedAfter).to.equal(true)

      await loans.methods.withdraw(numToBytes32(loanId), ensure0x(secrets[0])).send({ gas: 2000000 })
      const withdrawn = await loans.methods.withdrawn(numToBytes32(loanId)).call()
      expect(withdrawn).to.equal(true)

      const owedForLoan = await loans.methods.owedForLoan(numToBytes32(loanId)).call()

      const web3Address = await getWeb3Address(web3Chain)
      const { address: ethereumWithNodeAddress } = await chains.ethereumWithNode.client.wallet.getUnusedAddress()

      const token = await testLoadObject('erc20', getTestContract('erc20', principal), chains.web3WithNode, ensure0x(ethereumWithNodeAddress))
      await token.methods.transfer(web3Address, toWei(owedForLoan, 'wei')).send({ gas: 100000 })

      const testToken = await getTestObject(web3Chain, 'erc20', principal)
      await testToken.methods.approve(getTestContract('loans', principal), toWei(owedForLoan, 'wei')).send({ gas: 100000 })

      console.log('About to repay')
      await secondsCountDown(10)

      await loans.methods.repay(numToBytes32(loanId), owedForLoan).send({ gas: 2000000 })

      const paid = await loans.methods.paid(numToBytes32(loanId)).call()
      expect(paid).to.equal(true)

      console.log('REPAY LOAN')
      await secondsCountDown(50)

      const off = await loans.methods.off(numToBytes32(loanId)).call()
      expect(off).to.equal(true)

      const { acceptSecret } = await loans.methods.secretHashes(numToBytes32(loanId)).call()

      const refundParams = [lockTxHash, lockParams[1], remove0x(acceptSecret), lockParams[2], lockParams[3]]
      const refundTxHash = await btcChain.client.loan.collateral.refund(...refundParams)
      console.log('refundTxHash', refundTxHash)

      console.log('Mine BTC Block')
      await chains.bitcoinWithNode.client.chain.generateBlock(1)

      await secondsCountDown(60)

      const { body: loanMarketsAfterUnlocking } = await chai.request(server).get('/loanmarketinfo')
      const loanMarketAfterUnlocking = loanMarketsAfterUnlocking.find(loanMarket => loanMarket.principal === principal)
      const { totalCollateralValue: totalCollateralValueAfterUnlocking } = loanMarketAfterUnlocking
      expect(totalCollateralValueAfterUnlocking).to.equal(0)
    })
  })
}

async function secondsCountDown (num) {
  for (let i = num; i >= 0; i--) {
    console.log(`${i}s`)
    await sleep(1000)
  }
}

async function getLoanStatus (loanId) {
  const { body } = await chai.request(server).get(`/loans/${loanId}`)
  return body.status
}

async function testSetup (web3Chain, ethNode, btcChain) {
  const blockHeight = await btcChain.client.chain.getBlockHeight()
  if (blockHeight < 101) {
    await btcChain.client.chain.generateBlock(101)
  }

  await increaseTime(3600)
  await ethNode.client.getMethod('jsonrpc')('miner_start')
  const address = await getWeb3Address(web3Chain)
  rewriteEnv('.env', 'METAMASK_ETH_ADDRESS', address)
  await cancelLoans(web3Chain)
  await cancelJobs(server)
  await cancelJobs(arbiterServer)
  rewriteEnv('.env', 'MNEMONIC', `"${generateMnemonic(128)}"`)
  await removeFunds()
  await removeLoans()
  await fundAgent(server)
  await fundArbiter()
  await generateSecretHashesArbiter('SAI')
  await fundWeb3Address(web3Chain)
  await importBitcoinAddresses(btcChain)
  await fundUnusedBitcoinAddress(btcChain)
  await restartJobs(server)
  await restartJobs(arbiterServer)
}

function testSetupArbiter () {
  rewriteEnv('.env', 'API_OFFLINE', 'false')
  rewriteEnv('.env', 'ACCEPT_CANCEL_JOBS_OFFLINE', 'true')
}

function testAfterArbiter () {
  rewriteEnv('.env', 'API_OFFLINE', 'false')
  rewriteEnv('.env', 'ACCEPT_CANCEL_JOBS_OFFLINE', 'false')
}

describe('Lender Agent - Funds', () => {
  describe('Web3HDWallet / BitcoinJs', () => {
    before(async function () {
      await testSetup(chains.web3WithHDWallet, chains.ethereumWithNode, chains.bitcoinWithJs)
      testSetupArbiter()
    })
    after(function () {
      testAfterArbiter()
    })
    testCollateral(chains.web3WithHDWallet, chains.ethereumWithNode, chains.bitcoinWithJs)
  })

  if (!isCI) {
    describe('MetaMask / BitcoinJs', () => {
      connectMetaMask()
      before(async function () { await testSetup(chains.web3WithMetaMask, chains.ethereumWithNode, chains.bitcoinWithJs) })
      testCollateral(chains.web3WithMetaMask, chains.bitcoinWithJs)
    })

    describe('MetaMask / Ledger', () => {
      connectMetaMask()
      before(async function () { await testSetup(chains.web3WithMetaMask, chains.bitcoinWithLedger) })
      testCollateral(chains.web3WithMetaMask, chains.bitcoinWithLedger)
    })
  }
})

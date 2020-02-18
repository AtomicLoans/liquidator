/* eslint-env mocha */
const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')
const BN = require('bignumber.js')
const { checksumEncode } = require('@liquality/ethereum-utils')
const { sleep } = require('@liquality/utils')
const { generateMnemonic } = require('bip39')
const isCI = require('is-ci')

const { chains, rewriteEnv, connectMetaMask, importBitcoinAddresses, fundUnusedBitcoinAddress } = require('../../common')
const { fundArbiter, fundAgent, fundTokens, getAgentAddress, generateSecretHashesArbiter, getTestContract, getTestObjects, cancelLoans, removeFunds, removeLoans, cancelJobs, restartJobs, fundWeb3Address, increaseTime } = require('../loanCommon')
const fundFixtures = require('../fixtures/fundFixtures')
const { getWeb3Address } = require('../util/web3Helpers')
const { currencies } = require('../../../src/utils/fx')
const { numToBytes32, rateToSec } = require('../../../src/utils/finance')
const { createCustomFund, checkFundCreated } = require('../setup/fundSetup')
const web3 = require('web3')
const { toWei, fromWei } = web3.utils

chai.should()
const expect = chai.expect

chai.use(chaiHttp)
chai.use(chaiAsPromised)

const server = 'http://localhost:3030/api/loan'
const arbiterServer = 'http://localhost:3032/api/loan'

const arbiterChain = chains.web3WithArbiter

const WAD = BN(10).pow(18)

function testFunds (web3Chain, ethNode) {
  describe('Create Custom Loan Fund', () => {
    it('should create a new loan fund and deposit funds into it', async () => {
      const principal = 'SAI'
      const amount = 200
      const fixture = fundFixtures.customFundWithFundExpiryIn100Days
      const [funds] = await getTestObjects(web3Chain, principal, ['funds'])

      const { fundId, fundParams, amountDeposited, agentAddress } = await createFundFromFixture(web3Chain, fixture, principal, amount)
      const { fundExpiry, liquidationRatio, interest, penalty, fee } = fundParams

      const {
        lender, maxLoanDur, fundExpiry: actualFundExpiry, interest: actualInterest, penalty: actualPenalty, fee: actualFee, liquidationRatio: actualLiquidationRatio, balance
      } = await funds.methods.funds(numToBytes32(fundId)).call()

      expect(fromWei(balance, 'wei')).to.equal(amountDeposited)
      expect(lender).to.equal(checksumEncode(agentAddress))
      expect(maxLoanDur).to.equal(BN(2).pow(256).minus(1).toFixed())
      expect(actualFundExpiry).to.equal(fundExpiry.toString())
      expect(actualLiquidationRatio).to.equal(toWei((liquidationRatio / 100).toString(), 'gether'))
      expect(actualInterest).to.equal(toWei(rateToSec(interest.toString()), 'gether'))
      expect(actualPenalty).to.equal(toWei(rateToSec(penalty.toString()), 'gether'))
      expect(actualFee).to.equal(toWei(rateToSec(fee.toString()), 'gether'))
    })
  })

  describe('Create Custom Loan Fund with Compound Enabled', () => {
    it('should create a new loan fund and deposit funds into it', async () => {
      const principal = 'SAI'
      const amount = 200
      const fixture = fundFixtures.customFundWithFundExpiryIn100DaysAndCompoundEnabled
      const [funds, ctoken] = await getTestObjects(web3Chain, principal, ['funds', 'ctoken'])

      const { fundId, fundParams, amountDeposited, agentAddress } = await createFundFromFixture(web3Chain, fixture, principal, amount)
      const { fundExpiry, liquidationRatio, interest, penalty, fee } = fundParams

      const {
        lender, maxLoanDur, fundExpiry: actualFundExpiry, interest: actualInterest, penalty: actualPenalty, fee: actualFee, liquidationRatio: actualLiquidationRatio, cBalance
      } = await funds.methods.funds(numToBytes32(fundId)).call()

      const exchangeRateCurrent = await ctoken.methods.exchangeRateCurrent().call()
      const expectedCBalance = BN(amountDeposited).times(WAD).dividedBy(exchangeRateCurrent).toString()

      expect(fromWei(cBalance, 'wei')).to.equal(expectedCBalance)
      expect(lender).to.equal(checksumEncode(agentAddress))
      expect(maxLoanDur).to.equal(BN(2).pow(256).minus(1).toFixed())
      expect(actualFundExpiry).to.equal(fundExpiry.toString())
      expect(actualLiquidationRatio).to.equal(toWei((liquidationRatio / 100).toString(), 'gether'))
      expect(actualInterest).to.equal(toWei(rateToSec(interest.toString()), 'gether'))
      expect(actualPenalty).to.equal(toWei(rateToSec(penalty.toString()), 'gether'))
      expect(actualFee).to.equal(toWei(rateToSec(fee.toString()), 'gether'))
    })
  })

  describe.skip('Create Loan Fund with delayed mining time', () => { // TODO FIX
    it('should create a new loan fund and deposit funds into it', async () => {
      const currentTime = Math.floor(new Date().getTime() / 1000)
      const agentPrincipalAddress = await getAgentAddress(server)
      const address = await getWeb3Address(web3Chain)
      const fundParams = fundFixtures.fundWithFundExpiryIn100Days(currentTime, 'SAI')
      const { principal, fundExpiry } = fundParams
      const [token, funds] = await getTestObjects(web3Chain, principal, ['erc20', 'funds'])
      const unit = currencies[principal].unit
      const amountToDeposit = toWei('200', unit)
      await fundTokens(address, amountToDeposit, principal)

      await ethNode.client.getMethod('jsonrpc')('miner_stop')

      console.log('fundParams', fundParams)

      const { body } = await chai.request(server).post('/funds/new').send(fundParams)
      const { id: fundModelId } = body

      await sleep(5000)
      await ethNode.client.getMethod('jsonrpc')('miner_start')

      const fundId = await checkFundCreated(fundModelId)

      await token.methods.approve(getTestContract('funds', principal), amountToDeposit).send({ gas: 100000 })
      await funds.methods.deposit(numToBytes32(fundId), amountToDeposit).send({ gas: 500000 })

      const {
        lender, maxLoanDur, fundExpiry: actualFundExpiry, balance
      } = await funds.methods.funds(numToBytes32(fundId)).call()

      expect(fromWei(balance, 'wei')).to.equal(amountToDeposit)
      expect(lender).to.equal(checksumEncode(agentPrincipalAddress))
      expect(maxLoanDur).to.equal(BN(2).pow(256).minus(1).toFixed())
      expect(actualFundExpiry).to.equal(fundExpiry.toString())
    })
  })

  describe('Create Regular Loan Fund with Compound Enabled', () => {
    it.skip('should create a new loan fund and deposit funds into it', async () => { // TODO FIX
      const principal = 'SAI'
      const amount = 200
      const fixture = fundFixtures.fundWithFundExpiryIn100DaysAndCompoundEnabled
      const [funds, ctoken] = await getTestObjects(web3Chain, principal, ['funds', 'ctoken'])

      const { fundId, fundParams, amountDeposited, agentAddress } = await createFundFromFixture(web3Chain, fixture, principal, amount)
      const { fundExpiry } = fundParams

      const {
        lender, maxLoanDur, fundExpiry: actualFundExpiry, cBalance
      } = await funds.methods.funds(numToBytes32(fundId)).call()

      const exchangeRateCurrent = await ctoken.methods.exchangeRateCurrent().call()
      const expectedCBalance = BN(amountDeposited).times(WAD).dividedBy(exchangeRateCurrent).toString()

      expect(fromWei(cBalance, 'wei')).to.equal(expectedCBalance)
      expect(lender).to.equal(checksumEncode(agentAddress))
      expect(maxLoanDur).to.equal(BN(2).pow(256).minus(1).toFixed())
      expect(actualFundExpiry).to.equal(fundExpiry.toString())
    })
  })

  describe('Create fund agent request status', () => {
    it.skip('should return 401 when attempting to create more than one fund with same principal', async () => { // TODO: remove .skip
      const currentTime = Math.floor(new Date().getTime() / 1000)

      await createCustomFund(web3Chain, arbiterChain, 200, 'SAI')

      const fundParams = fundFixtures.customFundWithFundExpiryIn100Days(currentTime, 'SAI')
      const { status } = await chai.request(server).post('/funds/new').send(fundParams)

      expect(status).to.equal(401)
    })
  })

  describe('Create fund with different principal', () => {
    it.skip('should succeed in creating two funds with different principal', async () => {
      const currentTime = Math.floor(new Date().getTime() / 1000)

      await createCustomFund(web3Chain, arbiterChain, 200, 'USDC')

      const fundParams = fundFixtures.customFundWithFundExpiryIn100Days(currentTime, 'SAI')
      const { status } = await chai.request(server).post('/funds/new').send(fundParams)

      expect(status).to.equal(200)
    })
  })

  describe('Create Fund Tx Error', () => {
    it.skip('should set Fund status to FAILED', async () => { // TODO FIX
      const address = await getWeb3Address(web3Chain)
      const fundParams = fundFixtures.invalidFundWithNillMaxLoanDurAndFundExpiry('SAI')
      const { principal } = fundParams
      const unit = currencies[principal].unit
      const amountToDeposit = toWei('200', unit)
      await fundTokens(address, amountToDeposit, principal)

      const { body: fundNewBody } = await chai.request(server).post('/funds/new').send(fundParams)
      const { id: fundModelId } = fundNewBody

      await sleep(5000)

      const { body: fundsIdBody } = await chai.request(server).get(`/funds/${fundModelId}`)
      const { status } = fundsIdBody

      expect(status).to.equal('FAILED')
    })

    it.skip('should allow creation of Fund after previous Fund creation failed', async () => { // TODO FIX
      const currentTime = Math.floor(new Date().getTime() / 1000)
      const address = await getWeb3Address(web3Chain)
      const fundParams = fundFixtures.invalidFundWithNillMaxLoanDurAndFundExpiry('SAI')
      const { principal } = fundParams
      const unit = currencies[principal].unit
      const amountToDeposit = toWei('200', unit)
      await fundTokens(address, amountToDeposit, principal)

      const { body: fundNewBody } = await chai.request(server).post('/funds/new').send(fundParams)
      const { id: fundModelId } = fundNewBody

      await sleep(5000)

      const { body: fundsIdBody } = await chai.request(server).get(`/funds/${fundModelId}`)
      const { status } = fundsIdBody

      expect(status).to.equal('FAILED')

      // Start success params
      const successFundParams = fundFixtures.customFundWithFundExpiryIn100Days(currentTime, 'SAI')
      await fundTokens(address, amountToDeposit, principal)

      const { body: fundNewBodySuccess } = await chai.request(server).post('/funds/new').send(successFundParams)
      const { id: fundModelIdSuccess } = fundNewBodySuccess

      await sleep(10000)

      const { body: fundsIdBodySuccess } = await chai.request(server).get(`/funds/${fundModelIdSuccess}`)
      const { status: statusSuccess } = fundsIdBodySuccess

      expect(statusSuccess).to.equal('CREATED')
    })

    it.skip('should allow lender to withdraw excess funds in loan fund', async () => {
      const currentTime = Math.floor(new Date().getTime() / 1000)
      const principal = 'USDC'
      const amount = 200
      const fixture = fundFixtures.fundWithFundExpiryIn100DaysAndCompoundEnabled
      const [funds, ctoken] = await getTestObjects(web3Chain, principal, ['funds', 'ctoken'])

      const params = fixture(currentTime, principal)

      const { collateral, custom, maxLoanDuration, fundExpiry, compoundEnabled } = params

      console.log('custom', custom)

      const message = `Create ${custom ? 'Custom' : 'Non-Custom'} ${principal} Loan Fund backed by ${collateral} with ${compoundEnabled ? 'Compound Enabled' : 'Compound Disabled'} and Maximum Loan Duration of ${maxLoanDuration} seconds which expires at timestamp ${fundExpiry} and deposit ${0} ${principal}`
      console.log('message', message)

      const address = await getWeb3Address(web3Chain)

      const signature = await web3Chain.client.eth.personal.sign(message, address)

      const { fundId, fundModelId, amountDeposited, agentAddress } = await createFundFromFixture(web3Chain, fixture, principal, amount, message, signature)

      const { lender, maxLoanDur, fundExpiry: actualFundExpiry, cBalance } = await funds.methods.funds(numToBytes32(fundId)).call()

      const exchangeRateCurrent = await ctoken.methods.exchangeRateCurrent().call()
      const expectedCBalance = BN(amountDeposited).times(WAD).dividedBy(exchangeRateCurrent).toString()

      expect(fromWei(cBalance, 'wei')).to.equal(expectedCBalance)
      expect(lender).to.equal(checksumEncode(agentAddress))
      expect(maxLoanDur).to.equal(BN(2).pow(256).minus(1).toFixed())
      expect(actualFundExpiry).to.equal(fundExpiry.toString())

      const amountToWithdraw = 100
      const currentTimeWithdraw = Math.floor(new Date().getTime() / 1000)

      const withdrawMessage = `Withdraw ${amountToWithdraw} ${principal} at ${currentTimeWithdraw}`
      const withdrawSignature = await web3Chain.client.eth.personal.sign(withdrawMessage, address)

      await chai.request(server).post(`/funds/${fundModelId}/withdraw`).send({
        timestamp: currentTimeWithdraw, amountToWithdraw, signature: withdrawSignature, message: withdrawMessage
      })

      console.log('sleep 10000')
      await sleep(10000)

      const { cBalance: newCBalance } = await funds.methods.funds(numToBytes32(fundId)).call()

      expect(parseInt(newCBalance)).to.equal(cBalance / 2)
    })

    it.skip('should allow lender to update loan fund', async () => {
      const currentTime = Math.floor(new Date().getTime() / 1000)
      const principal = 'USDC'
      const amount = 200
      const fixture = fundFixtures.fundWithFundExpiryIn100DaysAndCompoundEnabled
      const [funds, ctoken] = await getTestObjects(web3Chain, principal, ['funds', 'ctoken'])

      const params = fixture(currentTime, principal)

      const { collateral, custom, maxLoanDuration, fundExpiry, compoundEnabled } = params

      console.log('custom', custom)

      const message = `Create ${custom ? 'Custom' : 'Non-Custom'} ${principal} Loan Fund backed by ${collateral} with ${compoundEnabled ? 'Compound Enabled' : 'Compound Disabled'} and Maximum Loan Duration of ${maxLoanDuration} seconds which expires at timestamp ${fundExpiry} and deposit ${0} ${principal}`
      console.log('message', message)

      const address = await getWeb3Address(web3Chain)

      const signature = await web3Chain.client.eth.personal.sign(message, address)

      const { fundId, amountDeposited, agentAddress } = await createFundFromFixture(web3Chain, fixture, principal, amount, message, signature)

      const { lender, maxLoanDur, fundExpiry: actualFundExpiry, cBalance } = await funds.methods.funds(numToBytes32(fundId)).call()

      const exchangeRateCurrent = await ctoken.methods.exchangeRateCurrent().call()
      const expectedCBalance = BN(amountDeposited).times(WAD).dividedBy(exchangeRateCurrent).toString()

      expect(fromWei(cBalance, 'wei')).to.equal(expectedCBalance)
      expect(lender).to.equal(checksumEncode(agentAddress))
      expect(maxLoanDur).to.equal(BN(2).pow(256).minus(1).toFixed())
      expect(actualFundExpiry).to.equal(fundExpiry.toString())

      const currentTimeUpdate = Math.floor(new Date().getTime() / 1000)
      const newFundExpiry = currentTimeUpdate + 100000

      const updateMessage = `Update ${principal} Fund with maxLoanDuration: ${maxLoanDuration} and fundExpiry ${newFundExpiry} at timestamp ${currentTimeUpdate}`
      const updateSignature = await web3Chain.client.eth.personal.sign(updateMessage, address)

      await chai.request(server).post(`/funds/contract/${principal}/${fundId}/update`).send({
        timestamp: currentTimeUpdate, maxLoanDuration, fundExpiry: newFundExpiry, signature: updateSignature, message: updateMessage
      })

      console.log('sleep 10000')
      await sleep(12000)

      const { fundExpiry: actualFundExpiry2 } = await funds.methods.funds(numToBytes32(fundId)).call()

      expect(parseInt(actualFundExpiry2)).to.equal(newFundExpiry)
    })
  })

  // Only run this test after commenting out `await createFund(txParams, fund, done)`. Ganache does not currently support a mempool
  // describe.only('Transaction fee bumping', () => {
  //   before(function () { rewriteEnv('.env', 'TEST_TX_OVERWRITE', true) })
  //   after(function() { rewriteEnv('.env', 'TEST_TX_OVERWRITE', false) })

  //   it('should bump transaction if current tx stuck in mempool for CHECK_TX_INTERVAL', async () => {
  //     const currentTime = Math.floor(new Date().getTime() / 1000)

  //     await sleep(5000)

  //     const fundParams = fundFixtures.customFundWithFundExpiryIn100Days(currentTime, 'USDC')
  //     const { status } = await chai.request(server).post('/funds/new').send(fundParams)

  //     await sleep(13000)

  //     rewriteEnv('.env', 'TEST_TX_OVERWRITE', false)
  //   })
  // })
}

async function createFundFromFixture (web3Chain, fixture, principal_, amount, message, signature) {
  const currentTime = Math.floor(new Date().getTime() / 1000)
  const agentPrincipalAddress = await getAgentAddress(server)
  const address = await getWeb3Address(web3Chain)
  const fundParams = fixture(currentTime, principal_)
  const { principal } = fundParams
  const [token, funds] = await getTestObjects(web3Chain, principal, ['erc20', 'funds'])
  const unit = currencies[principal].unit
  const amountToDeposit = toWei(amount.toString(), unit)
  await fundTokens(address, amountToDeposit, principal)

  fundParams.message = message
  fundParams.signature = signature

  const { body } = await chai.request(server).post('/funds/new').send(fundParams)
  const { id: fundModelId } = body

  const fundId = await checkFundCreated(fundModelId)

  await token.methods.approve(getTestContract('funds', principal), amountToDeposit).send({ gas: 500000 })
  await funds.methods.deposit(numToBytes32(fundId), amountToDeposit).send({ gas: 2000000 })

  return { fundId, fundParams, agentAddress: agentPrincipalAddress, amountDeposited: amountToDeposit, fundModelId }
}

async function testSetup (web3Chain, ethNode, btcChain) {
  const blockHeight = await btcChain.client.chain.getBlockHeight()
  if (blockHeight < 101) {
    await btcChain.client.chain.generateBlock(101)
  }

  await increaseTime(3600)
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

describe('Lender Agent - Funds', () => {
  describe('Web3HDWallet / BitcoinJs', () => {
    beforeEach(async function () { await testSetup(chains.web3WithHDWallet, chains.ethereumWithNode, chains.bitcoinWithJs) })
    testFunds(chains.web3WithHDWallet, chains.ethereumWithNode)
  })

  if (!isCI) {
    describe('MetaMask / Ledger', () => {
      connectMetaMask()
      beforeEach(async function () { await testSetup(chains.web3WithMetaMask, chains.bitcoinWithLedger, chains.bitcoinWithJs) })
      testFunds(chains.web3WithMetaMask, chains.bitcoinWithLedger)
    })

    describe('MetaMask / BitcoinJs', () => {
      connectMetaMask()
      beforeEach(async function () { await testSetup(chains.web3WithMetaMask, chains.ethereumWithNode, chains.bitcoinWithJs) })
      testFunds(chains.web3WithMetaMask, chains.ethereumWithNode)
    })
  }
})

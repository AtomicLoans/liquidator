/* eslint-env mocha */
const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')
const { generateMnemonic } = require('bip39')

const { chains, importBitcoinAddresses, fundUnusedBitcoinAddress, rewriteEnv } = require('../../common')
const { fundArbiter, fundAgent, generateSecretHashesArbiter, getTestObject, cancelLoans, fundWeb3Address, cancelJobs, removeFunds, removeLoans, increaseTime, restartJobs, secondsCountDown } = require('../loanCommon')
const { providePofAndRequest } = require('./common')
const { getWeb3Address } = require('../util/web3Helpers')
const { numToBytes32 } = require('../../../src/utils/finance')
const { createCustomFund } = require('../setup/fundSetup')

chai.should()
const expect = chai.expect

chai.use(chaiHttp)
chai.use(chaiAsPromised)

const server = 'http://localhost:3030/api/loan'
const arbiterServer = 'http://localhost:3032/api/loan'

const arbiterChain = chains.web3WithArbiter

function testLoans (web3Chain, btcChain) {
  describe('Cancel Loan', () => {
    it('should cancel loan if after approveExpiration', async () => {
      const principal = 'SAI'
      const collateral = 'BTC'
      const loans = await getTestObject(web3Chain, 'loans', principal)

      const loanId = await providePofAndRequest(web3Chain, btcChain, principal, collateral)

      await increaseTime(86400 + 30)

      console.log('WAITING FOR CANCEL')

      await secondsCountDown(45)

      const { off, withdrawn } = await loans.methods.bools(numToBytes32(loanId)).call()

      expect(off).to.equal(true)
      expect(withdrawn).to.equal(false)
    })
  })
}

async function testSetup (web3Chain, btcChain) {
  const blockHeight = await chains.bitcoinWithJs.client.chain.getBlockHeight()
  if (blockHeight < 101) {
    await chains.bitcoinWithJs.client.chain.generateBlock(101)
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
  await createCustomFund(web3Chain, arbiterChain, 200, 'SAI') // Create Custom Loan Fund with 200 SAI
}

describe('Lender Agent - Loans', () => {
  describe('Web3HDWallet / BitcoinJs', () => {
    before(async function () { await testSetup(chains.web3WithHDWallet, chains.bitcoinWithJs) })
    testLoans(chains.web3WithHDWallet, chains.bitcoinWithJs)
  })

  // if (!isCI) {
  //   describe('MetaMask / BitcoinJs', () => {
  //     connectMetaMask()
  //     before(async function () { await testSetup(chains.web3WithMetaMask, chains.bitcoinWithJs) })
  //     testLoans(chains.web3WithMetaMask, chains.bitcoinWithJs)
  //   })

  //   describe('MetaMask / Ledger', () => {
  //     connectMetaMask()
  //     before(async function () { await testSetup(chains.web3WithMetaMask, chains.bitcoinWithLedger) })
  //     testLoans(chains.web3WithMetaMask, chains.bitcoinWithLedger)
  //   })
  // }
})

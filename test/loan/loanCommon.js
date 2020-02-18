const { chains } = require('../common')
const { testLoadObject } = require('./util/contracts')
const { getWeb3Address } = require('./util/web3Helpers')
const { ensure0x, remove0x, checksumEncode } = require('@liquality/ethereum-utils')
const { sleep } = require('@liquality/utils')
const { sha256 } = require('@liquality/crypto')
const web3 = require('web3')
const { numToBytes32 } = require('../../src/utils/finance')
const { contractAddresses } = require('../../src/networks/index')
const { getCurrentTime } = require('../../src/utils/time')
const { toWei } = web3.utils

const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')

chai.should()
chai.use(chaiHttp)
chai.use(chaiAsPromised)

const lenderServer = 'http://localhost:3030/api/loan'

const addresses = contractAddresses(process.env.NETWORK)

async function cancelJobs (server) {
  await chai.request(server).post('/cancel_jobs').send()
}

async function restartJobs (server) {
  await chai.request(server).post('/restart_jobs').send()
}

async function fundArbiter () {
  const unusedAddress = (await chains.web3WithArbiter.client.currentProvider.getAddresses())[0]
  await chains.ethereumWithNode.client.chain.sendTransaction(unusedAddress, toWei('0.3', 'ether'))
}

async function fundLender () {
  const unusedAddress = (await chains.web3WithLender.client.currentProvider.getAddresses())[0]
  await chains.ethereumWithNode.client.chain.sendTransaction(unusedAddress, toWei('0.3', 'ether'))
}

async function fundAgent (server) {
  const { body: loanMarkets } = await chai.request(server).get('/loanmarketinfo')
  const { body: addresses } = await chai.request(server).get(`/agentinfo/${loanMarkets[0].id}`)
  const { principalAddress } = addresses

  await chains.ethereumWithNode.client.chain.sendTransaction(principalAddress, toWei('0.2', 'ether'))
}

async function fundTokens (recipient, amount, principal) {
  const { address: ethereumWithNodeAddress } = await chains.ethereumWithNode.client.wallet.getUnusedAddress()

  const token = await testLoadObject('erc20', getTestContract('erc20', principal), chains.web3WithNode, ensure0x(ethereumWithNodeAddress))
  await token.methods.transfer(recipient, amount).send({ gas: 100000 })
}

async function getAgentAddress (server) {
  const { body: loanMarkets } = await chai.request(server).get('/loanmarketinfo')
  const { body: addresses } = await chai.request(server).get(`/agentinfo/${loanMarkets[0].id}`)
  const { principalAddress } = addresses

  return checksumEncode(principalAddress)
}

async function getAgentAddresses (server) {
  const { body: loanMarkets } = await chai.request(server).get('/loanmarketinfo')
  const { body: addresses } = await chai.request(server).get(`/agentinfo/${loanMarkets[0].id}`)
  const { principalAddress, collateralAddress, collateralPublicKey } = addresses

  return { principalAddress: checksumEncode(principalAddress), collateralAddress, collateralPublicKey }
}

async function generateSecretHashesArbiter (principal) {
  const address = (await chains.web3WithArbiter.client.currentProvider.getAddresses())[0]
  const { publicKey } = await chains.bitcoinArbiter.client.wallet.getUnusedAddress()

  const secrets = await chains.bitcoinWithJs.client.loan.secrets.generateSecrets('test', 160)
  const secretHashes = secrets.map(secret => ensure0x(sha256(secret)))

  const testFunds = await testLoadObject('funds', getTestContract('funds', principal), chains.web3WithArbiter, address)
  await testFunds.methods.generate(secretHashes).send({ from: address, gas: 6700000 })
  await testFunds.methods.setPubKey(ensure0x(publicKey.toString('hex'))).send({ from: address, gas: 100000 })
}

async function getLockParams (web3Chain, principal, values, loanId) {
  const testLoans = await getTestObject(web3Chain, 'loans', principal)

  const { borrowerPubKey, lenderPubKey, arbiterPubKey } = await testLoans.methods.pubKeys(numToBytes32(loanId)).call()
  const { secretHashA1, secretHashB1, secretHashC1 } = await testLoans.methods.secretHashes(numToBytes32(loanId)).call()
  const approveExpiration = await testLoans.methods.approveExpiration(numToBytes32(loanId)).call()
  const liquidationExpiration = await testLoans.methods.liquidationExpiration(numToBytes32(loanId)).call()
  const seizureExpiration = await testLoans.methods.seizureExpiration(numToBytes32(loanId)).call()

  const pubKeys = { borrowerPubKey: remove0x(borrowerPubKey), lenderPubKey: remove0x(lenderPubKey), arbiterPubKey: remove0x(arbiterPubKey) }
  const secretHashes = { secretHashA1: remove0x(secretHashA1), secretHashB1: remove0x(secretHashB1), secretHashC1: remove0x(secretHashC1) }
  const expirations = { approveExpiration, liquidationExpiration, seizureExpiration }

  return [values, pubKeys, secretHashes, expirations]
}

function getTestContract (contract, principal) {
  if (contract === 'erc20' || contract === 'ctoken') {
    const cPrefix = contract === 'ctoken' ? 'C' : ''
    return addresses[`${cPrefix}${principal}`]
  } else if (contract === 'medianizer' || contract === 'ondemandspv') {
    return addresses[`${contract.toUpperCase()}`]
  } else {
    return addresses[`${principal}_${contract.toUpperCase()}`]
  }
}

async function getTestObject (web3Chain, contract, principal) {
  const address = await getWeb3Address(web3Chain)
  return testLoadObject(contract, getTestContract(contract, principal), web3Chain, address)
}

async function getTestObjects (web3Chain, principal, contracts) {
  const objects = []
  for (const contract of contracts) {
    const object = await getTestObject(web3Chain, contract, principal)
    objects.push(object)
  }
  return objects
}

async function fundWeb3Address (web3Chain) {
  const address = await getWeb3Address(web3Chain)
  await chains.ethereumWithNode.client.chain.sendTransaction(address, 140000000000000000)
}

async function cancelLoans (chain) {
  const timestamp = Math.floor(new Date().getTime() / 1000)
  const address = await getWeb3Address(chain)
  const message = `Cancel all loans for ${address} at ${timestamp}`

  const signature = await chain.client.eth.personal.sign(message, address)

  await chai.request(lenderServer).post('/loans/cancel_all').send({ timestamp, signature, message })
}

async function removeFunds () {
  await chai.request(lenderServer).post('/remove_funds').send()
}

async function removeLoans () {
  await chai.request(lenderServer).post('/remove_loans').send()
}

async function increaseTime (seconds) {
  await chains.ethereumWithNode.client.getMethod('jsonrpc')('evm_increaseTime', seconds)
  await chains.ethereumWithNode.client.getMethod('jsonrpc')('evm_mine')

  const currentTime = await getCurrentTime()

  await chains.bitcoinWithNode.client.getMethod('jsonrpc')('setmocktime', currentTime)

  await chains.bitcoinWithNode.client.chain.generateBlock(10)
}

async function secondsCountDown (num) {
  for (let i = num; i >= 0; i--) {
    console.log(`${i}s`)
    await sleep(1000)
  }
}

module.exports = {
  fundArbiter,
  fundLender,
  fundAgent,
  fundTokens,
  getAgentAddress,
  getAgentAddresses,
  generateSecretHashesArbiter,
  getLockParams,
  getTestContract,
  getTestObject,
  getTestObjects,
  cancelLoans,
  cancelJobs,
  restartJobs,
  removeFunds,
  removeLoans,
  fundWeb3Address,
  increaseTime,
  secondsCountDown
}

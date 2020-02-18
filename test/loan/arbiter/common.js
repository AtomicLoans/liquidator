/* eslint-env mocha */
const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')
const BN = require('bignumber.js')
const toSecs = require('@mblackmblack/to-seconds')
const { sha256 } = require('@liquality/crypto')
const { ensure0x } = require('@liquality/ethereum-utils')

const { getTestContract, getTestObjects, getAgentAddress, fundTokens } = require('../loanCommon')
const { chains } = require('../../common')
const { getWeb3Address } = require('../util/web3Helpers')
const { currencies } = require('../../../src/utils/fx')
const web3 = require('web3')

const { toWei } = web3.utils

chai.should()

chai.use(chaiHttp)
chai.use(chaiAsPromised)

const swapServer = 'http://localhost:3032/api/swap'
const server = 'http://localhost:3032/api/loan'

const lenderWeb3Chain = chains.web3WithLender
const borrowerWeb3Chain = chains.web3WithBorrower

const lenderBtcChain = chains.bitcoinLender
const borrowerBtcChain = chains.bitcoinBorrower

async function createFundAndRequestMultipleTimes (principal, collateral, amount, count) {
  const unit = currencies[principal].unit
  const [lenderFunds, lenderToken] = await getTestObjects(lenderWeb3Chain, principal, ['funds', 'erc20'])

  const arbiterAddress = await getAgentAddress(server)
  const lenderAddress = await getWeb3Address(lenderWeb3Chain)

  const amountInWei = toWei((amount * count).toString(), unit)

  const fundParams = [
    toSecs({ days: 366 }),
    BN(2).pow(256).minus(1).toFixed(),
    arbiterAddress,
    false,
    0
  ]

  console.log('lenderAddress', lenderAddress)

  const fundId = await lenderFunds.methods.create(...fundParams).call()
  await lenderFunds.methods.create(...fundParams).send({ gas: 2000000 })

  console.log('test2')

  await fundTokens(lenderAddress, amountInWei, principal)

  await lenderToken.methods.approve(getTestContract('funds', principal), amountInWei).send({ gas: 100000 })
  await lenderFunds.methods.deposit(fundId, amountInWei).send({ gas: 400000 })

  console.log('fundId', fundId)

  const { body: markets } = await chai.request(swapServer).get('/marketinfo')
  const market = markets.find(market => (market.from === collateral && market.to === principal))
  const { rate } = market

  for (let i = 0; i < count; i++) {
    await requestLoan(fundId, amount, rate, principal, collateral, i)
  }
}

async function requestLoan (fundId, amount, rate, principal, collateral, i) {
  const currentTime = Math.floor(new Date().getTime() / 1000)
  const unit = currencies[principal].unit
  const [lenderFunds] = await getTestObjects(lenderWeb3Chain, principal, ['funds', 'erc20'])

  const borrowerAddress = await getWeb3Address(borrowerWeb3Chain)

  const collateralAmountInSats = BN(amount).dividedBy(rate).times(currencies[collateral].multiplier).toFixed(0)

  const borrowerSecrets = await borrowerBtcChain.client.loan.secrets.generateSecrets(`${currentTime}${i}`, 4)
  const borrowerSecretHashes = borrowerSecrets.map(secret => ensure0x(sha256(secret)))

  const lenderSecrets = await lenderBtcChain.client.loan.secrets.generateSecrets(`${currentTime}${i}`, 4)
  const lenderSecretHashes = lenderSecrets.map(secret => ensure0x(sha256(secret)))

  const borrowerAddresses = await borrowerBtcChain.client.wallet.getAddresses()
  const borrowerPublicKey = borrowerAddresses[0].publicKey.toString('hex')

  const lenderAddresses = await lenderBtcChain.client.wallet.getAddresses()
  const lenderPublicKey = lenderAddresses[0].publicKey.toString('hex')

  const loanParams = [
    fundId,
    borrowerAddress,
    toWei(amount.toString(), unit),
    collateralAmountInSats,
    toSecs({ days: 2 }),
    Math.floor(Date.now() / 1000),
    [...borrowerSecretHashes, ...lenderSecretHashes],
    ensure0x(borrowerPublicKey),
    ensure0x(lenderPublicKey)
  ]

  console.log('loanParams', loanParams)

  const loanId = await lenderFunds.methods.request(...loanParams).call()
  await lenderFunds.methods.request(...loanParams).send()

  return loanId
}

module.exports = {
  createFundAndRequestMultipleTimes
}

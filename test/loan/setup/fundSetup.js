const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')
const web3 = require('web3')
const { sleep } = require('@liquality/utils')

const { chains } = require('../../common')
const { getWeb3Address } = require('../util/web3Helpers')
const { getTestContract, getTestObjects, fundTokens } = require('../loanCommon')
const { numToBytes32 } = require('../../../src/utils/finance')
const { currencies } = require('../../../src/utils/fx')
const fundFixtures = require('../fixtures/fundFixtures')

const { toWei } = web3.utils

chai.should()

chai.use(chaiHttp)
chai.use(chaiAsPromised)

const server = 'http://localhost:3030/api/loan'

async function createCustomFund (web3Chain, arbiterChain, amount, principal) {
  const { body: loanMarkets } = await chai.request(server).get('/loanmarketinfo')
  const { body: addresses } = await chai.request(server).get(`/agentinfo/${loanMarkets[0].id}`)
  const { principalAddress } = addresses

  await chains.ethereumWithNode.client.chain.sendTransaction(principalAddress, toWei('0.2', 'ether'))

  const currentTime = Math.floor(new Date().getTime() / 1000)
  const address = await getWeb3Address(web3Chain)
  const fundParams = fundFixtures.customFundWithFundExpiryIn100Days(currentTime, principal)
  const [token, funds] = await getTestObjects(web3Chain, principal, ['erc20', 'funds'])
  const unit = currencies[principal].unit
  const amountToDeposit = toWei(amount.toString(), unit)
  await fundTokens(address, amountToDeposit, principal)

  const { body } = await chai.request(server).post('/funds/new').send(fundParams)
  const { id: fundModelId } = body

  const fundId = await checkFundCreated(fundModelId)

  await token.methods.approve(getTestContract('funds', principal), amountToDeposit).send({ gas: 100000 })
  await funds.methods.deposit(numToBytes32(fundId), amountToDeposit).send({ gas: 100000 })

  return fundId
}

async function depositToFund (web3Chain, amount, principal) {
  const address = await getWeb3Address(web3Chain)
  const [token, funds] = await getTestObjects(web3Chain, principal, ['erc20', 'funds'])
  const unit = currencies[principal].unit
  const amountToDeposit = toWei(amount.toString(), unit)
  await fundTokens(address, amountToDeposit, principal)

  const { body } = await chai.request(server).get(`/funds/ticker/${principal}`)
  const { fundId } = body

  await token.methods.approve(getTestContract('funds', principal), amountToDeposit).send({ gas: 100000 })
  await funds.methods.deposit(numToBytes32(fundId), amountToDeposit).send({ gas: 100000 })

  return fundId
}

async function checkFundCreated (fundModelId) {
  let created = false
  let fundId
  while (!created) {
    await sleep(1000)
    const { body } = await chai.request(server).get(`/funds/${fundModelId}`)
    const { status } = body
    console.log(status)
    if (status === 'CREATED') {
      created = true
      fundId = body.fundId
    }
  }

  return fundId
}

module.exports = {
  createCustomFund,
  depositToFund,
  checkFundCreated
}

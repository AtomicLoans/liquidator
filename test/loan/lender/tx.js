/* eslint-env mocha */
const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')
const { generateMnemonic } = require('bip39')
const isCI = require('is-ci')

const { chains, connectMetaMask, rewriteEnv } = require('../../common')
const { fundWeb3Address } = require('../loanCommon')
const { getWeb3Address } = require('../util/web3Helpers')

chai.should()
const expect = chai.expect

chai.use(chaiHttp)
chai.use(chaiAsPromised)

const server = 'http://localhost:3030/api/loan'

function testTx (chain) {
  describe('/POST reset tx - Reset agent transactions', () => {
    it('should reset all transactions', async () => {
      const timestamp = Math.floor(new Date().getTime() / 1000)
      const address = await getWeb3Address(chain)
      const message = `Reset transactions at ${timestamp}`

      const signature = await chain.client.eth.personal.sign(message, address)

      const { status } = await chai.request(server).post('/reset').send({ timestamp, signature, message })

      console.log('status', status)

      expect(status).to.equal(200)
    })
  })
}

describe('Lender Agent - Withdraw', () => {
  describe('Web3HDWallet', () => {
    before(async function () {
      await fundWeb3Address(chains.web3WithHDWallet)
      const address = await getWeb3Address(chains.web3WithHDWallet)
      rewriteEnv('.env', 'METAMASK_ETH_ADDRESS', address)
      rewriteEnv('.env', 'MNEMONIC', `"${generateMnemonic(128)}"`)
    })
    testTx(chains.web3WithHDWallet)
  })

  if (!isCI) {
    describe('MetaMask', () => {
      connectMetaMask()
      before(async function () {
        await fundWeb3Address(chains.web3WithMetaMask)
        const address = await getWeb3Address(chains.web3WithMetaMask)
        rewriteEnv('.env', 'METAMASK_ETH_ADDRESS', address)
        rewriteEnv('.env', 'MNEMONIC', `"${generateMnemonic(128)}"`)
      })
      testTx(chains.web3WithMetaMask)
    })
  }
})

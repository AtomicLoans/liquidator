/* eslint-env mocha */
const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')
const isCI = require('is-ci')

chai.should()
const expect = chai.expect

chai.use(chaiHttp)
chai.use(chaiAsPromised)

const { chains } = require('../../common')
const { getWeb3Address } = require('../util/web3Helpers')
const { getAgentAddresses, fundAgent } = require('../loanCommon')

const server = 'http://localhost:3032/api/loan'

function testArbiterAgents () {
  describe('/POST agents/new', () => {
    it('should POST agent data and return agent object', async () => {
      const ethSigner = await getWeb3Address(chains.web3WithHDWallet)
      const { principalAddress, collateralPublicKey } = await getAgentAddresses(server)

      const { status, body } = await chai.request(server).post('/agents/new').send({ ethSigner, principalAddress, collateralPublicKey })

      expect(status).to.equal(200)
      console.log('body', body)
    })
  })
}

async function testSetup () {
  await fundAgent(server)
}

if (!isCI) {
  describe('Arbiter Agent - Agents', () => {
    beforeEach(async function () { await testSetup() })
    testArbiterAgents()
  })
}

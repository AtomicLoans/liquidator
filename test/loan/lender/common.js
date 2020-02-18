/* eslint-env mocha */
const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')
const BN = require('bignumber.js')
const toSecs = require('@mblackmblack/to-seconds')
const bitcoin = require('bitcoinjs-lib')
const { sha256 } = require('@liquality/crypto')
const { sleep } = require('@liquality/utils')

const { importBitcoinAddressesByAddress } = require('../../common')
const { getTestObject, secondsCountDown } = require('../loanCommon')
const { getWeb3Address } = require('../util/web3Helpers')
const { currencies } = require('../../../src/utils/fx')
const { numToBytes32 } = require('../../../src/utils/finance')
const web3 = require('web3')

const { toWei } = web3.utils

chai.should()
const expect = chai.expect

chai.use(chaiHttp)
chai.use(chaiAsPromised)

const server = 'http://localhost:3030/api/loan'

async function getLoanStatus (loanId) {
  const { body } = await chai.request(server).get(`/loans/${loanId}`)
  return body.status
}

async function providePofAndRequest (web3Chain, btcChain, principal, collateral) {
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

  const { loanId, collateralRefundableP2SHAddress, collateralSeizableP2SHAddress } = requestedBody

  await importBitcoinAddressesByAddress([collateralRefundableP2SHAddress, collateralSeizableP2SHAddress])

  const loans = await getTestObject(web3Chain, 'loans', principal)
  const approvedBefore = await loans.methods.approved(numToBytes32(loanId)).call()
  expect(approvedBefore).to.equal(false)

  const funded = await loans.methods.funded(numToBytes32(loanId)).call()
  expect(funded).to.equal(true)

  await secondsCountDown(4)

  const expectedAwaitingCollateralStatus = await getLoanStatus(requestId)
  expect(expectedAwaitingCollateralStatus).to.equal('AWAITING_COLLATERAL')

  return loanId
}

module.exports = {
  providePofAndRequest
}

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

const { chains, importBitcoinAddresses, importBitcoinAddressesByAddress, fundUnusedBitcoinAddress, rewriteEnv } = require('../../common')
const { fundArbiter, fundAgent, generateSecretHashesArbiter, getLockParams, getTestContract, getTestObject, getTestObjects, cancelLoans, fundWeb3Address, cancelJobs, restartJobs, removeFunds, removeLoans, increaseTime, getAgentAddress, fundTokens } = require('../loanCommon')
const { getWeb3Address } = require('../util/web3Helpers')
const { currencies } = require('../../../src/utils/fx')
const { numToBytes32, rateToSec } = require('../../../src/utils/finance')
const { testLoadObject } = require('../util/contracts')
const { createCustomFund } = require('../setup/fundSetup')
const web3 = require('web3')

const { toWei, fromWei, hexToNumberString, hexToNumber } = web3.utils

chai.should()
const expect = chai.expect

chai.use(chaiHttp)
chai.use(chaiAsPromised)

const liquidatorServer = 'http://localhost:3034/api/loan'

const arbiterWeb3Chain = chains.web3WithArbiter

const lenderWeb3Chain = chains.web3WithLender
const borrowerWeb3Chain = chains.web3WithBorrower

const lenderBtcChain = chains.bitcoinLender
const borrowerBtcChain = chains.bitcoinBorrower

const YEAR_IN_SECONDS = BN(31536000)

const BTC_TO_SAT = 10 ** 8

const borpubk = '02b4c50d2b6bdc9f45b9d705eeca37e811dfdeb7365bf42f82222f7a4a89868703'
const lendpubk = '03dc23d80e1cf6feadf464406e299ac7fec9ea13c51dfd9abd970758bf33d89bb6'
const arbiterpubk = '02688ce4b6ca876d3e0451e6059c34df4325745c1f7299ebc108812032106eaa32'

function testLiquidation (web3Chain, ethNode, btcChain) {
  describe('Liquidation Tests', () => {
    it('should POST loanMarket details and return loan details', async () => {
      const loanReq = 25; // 25 DAI
      const loanRat = 2; // Collateralization ratio of 200%
      let col;

      let arbiterSecs = []
      let arbiterSechs = []
      for (let i = 0; i < 4; i++) {
        let sec = sha256(Math.random().toString())
        arbiterSecs.push(ensure0x(sec))
        arbiterSechs.push(ensure0x(sha256(sec)))
      }

      let lendSecs = []
      let lendSechs = []
      for (let i = 0; i < 4; i++) {
        let sec = sha256(Math.random().toString())
        lendSecs.push(ensure0x(sec))
        lendSechs.push(ensure0x(sha256(sec)))
      }

      let borSecs = []
      let borSechs = []
      for (let i = 0; i < 4; i++) {
        let sec = sha256(Math.random().toString())
        borSecs.push(ensure0x(sec))
        borSechs.push(ensure0x(sha256(sec)))
      }

      const btcPrice = '9340.23'

      const principal = 'DAI'
      const unit = 'ether'
      const borrower = await getWeb3Address(borrowerWeb3Chain)
      const lender = await getWeb3Address(lenderWeb3Chain)
      const arbiter = await getWeb3Address(arbiterWeb3Chain)

      console.log('lender', lender)

      const [lenderFunds, lenderLoans, lenderToken, lenderExampleToken] = await getTestObjects(lenderWeb3Chain, principal, ['funds', 'loans', 'erc20', 'exampledaicoin'])

      const [arbiterFunds, arbiterLoans, arbiterToken] = await getTestObjects(arbiterWeb3Chain, principal, ['funds', 'loans', 'erc20'])

      const [borrowerLoans, borrowerToken] = await getTestObjects(borrowerWeb3Chain, principal, ['loans', 'erc20'])

      const { address: ethereumWithNodeAddress } = await chains.ethereumWithNode.client.wallet.getUnusedAddress()
      const medianizer = await testLoadObject('medianizer', getTestContract('medianizer', principal), chains.web3WithNode, ensure0x(ethereumWithNodeAddress))

      await medianizer.methods.poke(numToBytes32(toWei(btcPrice, 'ether'))).send({ gas: 2000000 })

      const fundParams = [
        toWei('1', unit),
        toWei('100', unit),
        toSecs({days: 1}),
        toSecs({days: 366}),
        YEAR_IN_SECONDS.times(2).plus(Math.floor(Date.now() / 1000)).toFixed(),
        toWei('1.5', 'gether'), // 150% collateralization ratio
        toWei(rateToSec('16.5'), 'gether'), // 16.50%
        toWei(rateToSec('3'), 'gether'), //  3.00%
        toWei(rateToSec('0.75'), 'gether'), //  0.75%
        arbiter,
        false,
        0
      ]

      const fund = await lenderFunds.methods.createCustom(...fundParams).call()
      await lenderFunds.methods.createCustom(...fundParams).send({ gas: 2000000 })

      console.log('fund', fund)

      await arbiterFunds.methods.generate(arbiterSechs).send({ gas: 2000000 })

      await arbiterFunds.methods.setPubKey(ensure0x(arbiterpubk)).send({ gas: 2000000 })


      const balanceBefore = await lenderToken.methods.balanceOf(lender).call()

      // for (let i = 0; i < 10; i++) {
      //   await lenderExampleToken.methods.mintTokens().send({ gas: 2000000 })
      // }

      await fundTokens(lender, toWei('100', 'ether'), principal)
      
      const balanceAfter = await lenderToken.methods.balanceOf(lender).call()

      console.log('balanceBefore', balanceBefore)
      console.log('balanceAfter', balanceAfter)

      // console.log('lenderFunds', lenderFunds)
      
      console.log('lenderFunds._address', lenderFunds._address)

      await lenderToken.methods.approve(lenderFunds._address, toWei('100', unit)).send({ gas: 2000000 })
      await lenderFunds.methods.deposit(fund, toWei('100', unit)).send({ gas: 2000000 })


      const fundBalance = await lenderFunds.methods.balance(fund).call()
      console.log('fundBalance', fundBalance)

      col = Math.round(((loanReq * loanRat) / btcPrice) * BTC_TO_SAT)

      // Pull from loan
      const loanParams = [
        fund,
        borrower,
        toWei(loanReq.toString(), unit),
        col,
        toSecs({days: 2}),
        ~~(Date.now() / 1000),
        [ ...borSechs, ...lendSechs ],
        ensure0x(borpubk),
        ensure0x(lendpubk)
      ]

      const loan = await lenderFunds.methods.request(...loanParams).call()
      await lenderFunds.methods.request(...loanParams).send({ gas: 2000000 })

      loanId = hexToNumber(loan)

      const refundableValue = await lenderLoans.methods.refundableCollateral(loan).call()
      const seizableValue = await lenderLoans.methods.seizableCollateral(loan).call()

      const values = { refundableValue, seizableValue }

      const usedAddresses = await btcChain.client.wallet.getUsedAddresses()
      console.log('usedAddresses', usedAddresses)

      await importBitcoinAddressesByAddress(usedAddresses)

      const balance = await btcChain.client.chain.getBalance(usedAddresses)
      console.log('balance', BN(balance).toFixed())

      const lockParams = await getLockParams(borrowerWeb3Chain, principal, values, loanId)
      const lockTxHash = await btcChain.client.loan.collateral.lock(...lockParams)
      console.log('lockTxHash', lockTxHash)

      await chains.bitcoinWithNode.client.chain.generateBlock(1)

      // await lenderLoans.methods.approve(loan).send({ gas: 2000000 })
      // await borrowerLoans.methods.withdraw(loan, borSecs[0]).send({ gas: 2000000 })


      // await medianizer.methods.poke(numToBytes32(toWei((btcPrice * 0.6).toString(), 'ether'))).send({ gas: 2000000 })


      // const medValue = await medianizer.methods.read().call()
      // console.log('medValue', medValue)

      // console.log('test', fromWei(hexToNumberString(medValue), 'ether'))


      // const safe = await lenderLoans.methods.safe(loan).call()
      // console.log('safe', safe)


      // const liquidator = await getAgentAddress(liquidatorServer)

      // console.log('liquidator', liquidator)



      // const discountBuyPre = await lenderLoans.methods.discountCollateralValue(loan).call()
      // const discountBuy = await lenderLoans.methods.ddiv(discountBuyPre).call()

      // console.log('discountBuy', discountBuy)


      // await fundTokens(liquidator, discountBuy, principal)





      // // Generate arbiter secret hashes
      // await this.funds.generate(arbiterSechs, { from: arbiter })

      // // Set Lender PubKey
      // await this.funds.setPubKey(ensure0x(arbiterpubk), { from: arbiter })

      // // Push funds to loan fund
      // await this.token.approve(this.funds.address, toWei('100', unit))
      // await this.funds.deposit(this.fund, toWei('100', unit))



      // const principal = 'SAI'
      // const collateral = 'BTC'
      // const principalAmount = 25
      // const loanDuration = toSecs({ days: 2 })

      // const { status: requestsStatus, body: requestsBody } = await chai.request(server).post('/loans/new').send({ principal, collateral, principalAmount, loanDuration })

      // expect(requestsStatus).to.equal(200)
      // requestsBody.should.be.a('object')

      // const { id: requestId, lenderPrincipalAddress, lenderCollateralPublicKey, minimumCollateralAmount, requestCreatedAt } = requestsBody

      // const borrowerPrincipalAddress = await getWeb3Address(web3Chain)

      // const { address, publicKey: borrowerCollateralPublicKey } = await btcChain.client.wallet.getUnusedAddress()
      // const collateralValue = Math.floor(BN(minimumCollateralAmount).times(currencies[collateral].multiplier).times(1.2).toNumber())

      // const currentTime = Date.now()

      // const data = Buffer.from(`${borrowerPrincipalAddress} ${principalAmount} ${currentTime}`, 'utf8')
      // const dataScript = bitcoin.payments.embed({ data: [data] })

      // const proofOfFundsTxHex = await btcChain.client.chain.buildBatchTransaction([{ to: address, value: collateralValue }, { to: dataScript.output, value: 0 }])

      // const secretData = [
      //   toWei(principalAmount.toString(), currencies[principal].unit), // Principal Value
      //   principal, // Principal
      //   collateralValue, // Collateral Value
      //   collateral, // Collateral
      //   borrowerPrincipalAddress, // Borrower Principal Address
      //   lenderPrincipalAddress, // Lender Principal Address
      //   borrowerCollateralPublicKey, // Borrower Collateral PubKey
      //   lenderCollateralPublicKey, // Lender Collateral PubKey
      //   requestCreatedAt // Fund Id as number
      // ]

      // const secretMsg = secretData.join('')
      // const secrets = await btcChain.client.loan.secrets.generateSecrets(secretMsg, 4)
      // const secretHashes = secrets.map(secret => sha256(secret))

      // const { status: requestsIdStatus, body: requestsIdBody } = await chai.request(server).post(`/loans/${requestId}/proof_of_funds`).send({
      //   proofOfFundsTxHex, borrowerSecretHashes: secretHashes, borrowerPrincipalAddress, borrowerCollateralPublicKey: borrowerCollateralPublicKey.toString('hex')
      // })
      // const {
      //   collateralAmount: collateralAmountActual, borrowerPrincipalAddress: borrowerPrincipalAddressActual, borrowerCollateralPublicKey: borrowerCollateralPublicKeyActual
      // } = requestsIdBody

      // expect(requestsIdStatus).to.equal(200)
      // requestsIdBody.should.be.a('object')
      // expect(BN(collateralAmountActual).times(currencies[collateral].multiplier).toNumber()).to.equal(collateralValue)
      // expect(borrowerPrincipalAddressActual).to.equal(borrowerPrincipalAddress)
      // expect(borrowerCollateralPublicKeyActual).to.equal(borrowerCollateralPublicKey.toString('hex'))

      // let requested = false
      // while (!requested) {
      //   await sleep(5000)
      //   const { body: requestedBody } = await chai.request(server).get(`/loans/${requestId}`)
      //   const { status } = requestedBody
      //   console.log(status)
      //   if (status === 'AWAITING_COLLATERAL') requested = true
      // }

      // const { body: requestedBody } = await chai.request(server).get(`/loans/${requestId}`)

      // const { loanId, refundableCollateralAmount, seizableCollateralAmount, collateralRefundableP2SHAddress, collateralSeizableP2SHAddress } = requestedBody

      // const values = {
      //   refundableValue: BN(refundableCollateralAmount).times(currencies[collateral].multiplier).toNumber(),
      //   seizableValue: BN(seizableCollateralAmount).times(currencies[collateral].multiplier).toNumber()
      // }

      // await importBitcoinAddressesByAddress([collateralRefundableP2SHAddress, collateralSeizableP2SHAddress])

      // const loans = await getTestObject(web3Chain, 'loans', principal)
      // const approvedBefore = await loans.methods.approved(numToBytes32(loanId)).call()
      // expect(approvedBefore).to.equal(false)

      // const funded = await loans.methods.funded(numToBytes32(loanId)).call()
      // expect(funded).to.equal(true)

      // await secondsCountDown(4)

      // const expectedAwaitingCollateralStatus = await getLoanStatus(requestId)
      // expect(expectedAwaitingCollateralStatus).to.equal('AWAITING_COLLATERAL')

      // const lockParams = await getLockParams(web3Chain, principal, values, loanId)
      // const lockTxHash = await btcChain.client.loan.collateral.lock(...lockParams)

      // const balance = await btcChain.client.chain.getBalance([collateralRefundableP2SHAddress, collateralSeizableP2SHAddress])
      // console.log('balance', balance)

      // await secondsCountDown(4)

      // console.log('Mine BTC Block')
      // await chains.bitcoinWithNode.client.chain.generateBlock(1)

      // await secondsCountDown(80)

      // const approvedAfter = await loans.methods.approved(numToBytes32(loanId)).call()
      // expect(approvedAfter).to.equal(true)

      // await loans.methods.withdraw(numToBytes32(loanId), ensure0x(secrets[0])).send({ gas: 2000000 })
      // const withdrawn = await loans.methods.withdrawn(numToBytes32(loanId)).call()
      // expect(withdrawn).to.equal(true)

      // const owedForLoan = await loans.methods.owedForLoan(numToBytes32(loanId)).call()

      // const web3Address = await getWeb3Address(web3Chain)
      // const { address: ethereumWithNodeAddress } = await chains.ethereumWithNode.client.wallet.getUnusedAddress()

      // const token = await testLoadObject('erc20', getTestContract('erc20', principal), chains.web3WithNode, ensure0x(ethereumWithNodeAddress))
      // await token.methods.transfer(web3Address, toWei(owedForLoan, 'wei')).send({ gas: 100000 })

      // const testToken = await getTestObject(web3Chain, 'erc20', principal)
      // await testToken.methods.approve(getTestContract('loans', principal), toWei(owedForLoan, 'wei')).send({ gas: 100000 })

      // console.log('About to repay')
      // await secondsCountDown(10)

      // await loans.methods.repay(numToBytes32(loanId), owedForLoan).send({ gas: 2000000 })

      // const paid = await loans.methods.paid(numToBytes32(loanId)).call()
      // expect(paid).to.equal(true)

      // console.log('REPAY LOAN')
      // await secondsCountDown(80)

      // const off = await loans.methods.off(numToBytes32(loanId)).call()
      // expect(off).to.equal(true)

      // const { acceptSecret } = await loans.methods.secretHashes(numToBytes32(loanId)).call()

      // const refundParams = [lockTxHash, lockParams[1], remove0x(acceptSecret), lockParams[2], lockParams[3]]
      // const refundTxHash = await btcChain.client.loan.collateral.refund(...refundParams)
      // console.log('refundTxHash', refundTxHash)
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

async function testSetup (web3Chain, btcChain) {
  const blockHeight = await chains.bitcoinWithJs.client.chain.getBlockHeight()
  if (blockHeight < 101) {
    await chains.bitcoinWithJs.client.chain.generateBlock(101)
  }

  rewriteEnv('test/env/.env.test', 'LENDER_MNEMONIC', `"${generateMnemonic(128)}"`)
  await increaseTime(3600)
  await fundAgent(liquidatorServer)
  await fundWeb3Address(web3Chain)
  await fundWeb3Address(arbiterWeb3Chain)
  await fundWeb3Address(lenderWeb3Chain)
  await fundWeb3Address(borrowerWeb3Chain)
  await importBitcoinAddresses(btcChain)
  await fundUnusedBitcoinAddress(btcChain)
  await restartJobs(liquidatorServer)
}

describe('Lender Agent - Funds', () => {
  describe('Web3HDWallet / BitcoinJs', () => {
    before(async function () {
      await testSetup(chains.web3WithHDWallet, chains.bitcoinWithJs)
      // testSetupArbiter()
    })
    // after(function () {
    //   testAfterArbiter()
    // })
    testLiquidation(chains.web3WithHDWallet, chains.ethereumWithNode, chains.bitcoinWithJs)
  })

  if (!isCI) {
    // describe('MetaMask / BitcoinJs', () => {
    //   connectMetaMask()
    //   before(async function () { await testSetup(chains.web3WithMetaMask, chains.ethereumWithNode, chains.bitcoinWithJs) })
    //   testE2E(chains.web3WithMetaMask, chains.bitcoinWithJs)
    // })

    // describe('MetaMask / Ledger', () => {
    //   connectMetaMask()
    //   before(async function () { await testSetup(chains.web3WithMetaMask, chains.bitcoinWithLedger) })
    //   testE2E(chains.web3WithMetaMask, chains.bitcoinWithLedger)
    // })
  }
})

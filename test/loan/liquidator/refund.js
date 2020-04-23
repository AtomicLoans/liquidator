/* eslint-env mocha */
const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')
const BN = require('bignumber.js')
const toSecs = require('@mblackmblack/to-seconds')
const { ensure0x } = require('@liquality/ethereum-utils')
const { generateMnemonic } = require('bip39')
const { sha256 } = require('@liquality/crypto')
const { sleep } = require('@liquality/utils')
const isCI = require('is-ci')

const { chains, importBitcoinAddresses, importBitcoinAddressesByAddress, fundUnusedBitcoinAddress, rewriteEnv } = require('../../common')
const { fundAgent, getLockParams, getTestContract, getTestObjects, fundWeb3Address, restartJobs, increaseTime, getAgentAddress, fundTokens } = require('../loanCommon')
const { getWeb3Address } = require('../util/web3Helpers')
const { numToBytes32, rateToSec } = require('../../../src/utils/finance')
const { testLoadObject } = require('../util/contracts')
const web3 = require('web3')

const { toWei, fromWei, hexToNumberString, hexToNumber } = web3.utils

chai.should()

chai.use(chaiHttp)
chai.use(chaiAsPromised)

const liquidatorServer = 'http://localhost:3034/api/loan'

const arbiterWeb3Chain = chains.web3WithArbiter
const lenderWeb3Chain = chains.web3WithLender
const borrowerWeb3Chain = chains.web3WithBorrower

const arbiterBtcChain = chains.bitcoinArbiter
const lenderBtcChain = chains.bitcoinLender
const borrowerBtcChain = chains.bitcoinBorrower

const YEAR_IN_SECONDS = BN(31536000)

const BTC_TO_SAT = 10 ** 8

let borpubk, lendpubk, arbiterpubk

function testRefund () {
  describe('Liquidation Tests', () => {
    it('should POST loanMarket details and return loan details', async () => {
      const loanReq = 25 // 25 DAI
      const loanRat = 2 // Collateralization ratio of 200%

      const arbiterSecs = []
      const arbiterSechs = []
      for (let i = 0; i < 4; i++) {
        const sec = sha256(Math.random().toString())
        arbiterSecs.push(ensure0x(sec))
        arbiterSechs.push(ensure0x(sha256(sec)))
      }

      const lendSecs = []
      const lendSechs = []
      for (let i = 0; i < 4; i++) {
        const sec = sha256(Math.random().toString())
        lendSecs.push(ensure0x(sec))
        lendSechs.push(ensure0x(sha256(sec)))
      }

      const borSecs = []
      const borSechs = []
      for (let i = 0; i < 4; i++) {
        const sec = sha256(Math.random().toString())
        borSecs.push(ensure0x(sec))
        borSechs.push(ensure0x(sha256(sec)))
      }

      const { publicKey: borrowerPubKey } = await borrowerBtcChain.client.wallet.getUnusedAddress()
      const { publicKey: lenderPubKey } = await lenderBtcChain.client.wallet.getUnusedAddress()
      const { publicKey: arbiterPubKey } = await arbiterBtcChain.client.wallet.getUnusedAddress()

      borpubk = borrowerPubKey.toString('hex')
      lendpubk = lenderPubKey.toString('hex')
      arbiterpubk = arbiterPubKey.toString('hex')

      const btcPrice = '14000'

      const principal = 'DAI'
      const unit = 'ether'
      const borrower = await getWeb3Address(borrowerWeb3Chain)
      const lender = await getWeb3Address(lenderWeb3Chain)
      const arbiter = await getWeb3Address(arbiterWeb3Chain)

      console.log('lender', lender)

      const [lenderFunds, lenderLoans, lenderSales, lenderToken] = await getTestObjects(lenderWeb3Chain, principal, ['funds', 'loans', 'sales', 'erc20'])

      const [arbiterFunds] = await getTestObjects(arbiterWeb3Chain, principal, ['funds', 'loans', 'sales', 'erc20'])

      const [borrowerLoans] = await getTestObjects(borrowerWeb3Chain, principal, ['loans', 'sales', 'erc20'])

      const { address: ethereumWithNodeAddress } = await chains.ethereumWithNode.client.wallet.getUnusedAddress()
      const medianizer = await testLoadObject('medianizer', getTestContract('medianizer', principal), chains.web3WithNode, ensure0x(ethereumWithNodeAddress))

      await medianizer.methods.poke(numToBytes32(toWei(btcPrice, 'ether'))).send({ gas: 2000000 })

      const fundParams = [
        toWei('1', unit),
        toWei('100', unit),
        toSecs({ days: 1 }),
        toSecs({ days: 366 }),
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

      await arbiterFunds.methods.generate(arbiterSechs).send({ gas: 2000000 })

      await arbiterFunds.methods.setPubKey(ensure0x(arbiterpubk)).send({ gas: 2000000 })

      await fundTokens(lender, toWei('100', 'ether'), principal)

      await lenderToken.methods.approve(lenderFunds._address, toWei('100', unit)).send({ gas: 2000000 })
      await lenderFunds.methods.deposit(fund, toWei('100', unit)).send({ gas: 2000000 })

      const col = Math.round(((loanReq * loanRat) / btcPrice) * BTC_TO_SAT)

      // Pull from loan
      const loanParams = [
        fund,
        borrower,
        toWei(loanReq.toString(), unit),
        col,
        toSecs({ days: 2 }),
        ~~(Date.now() / 1000),
        [...borSechs, ...lendSechs],
        ensure0x(borpubk),
        ensure0x(lendpubk)
      ]

      const loan = await lenderFunds.methods.request(...loanParams).call()
      await lenderFunds.methods.request(...loanParams).send({ gas: 2000000 })

      const loanId = hexToNumber(loan)

      const refundableValue = parseInt(await lenderLoans.methods.refundableCollateral(loan).call())
      const seizableValue = parseInt(await lenderLoans.methods.seizableCollateral(loan).call())

      const values = { refundableValue, seizableValue }

      const lockParams = await getLockParams(borrowerWeb3Chain, principal, values, loanId)
      const lockTxHash = await borrowerBtcChain.client.loan.collateral.lock(...lockParams)
      console.log('lockTxHash', lockTxHash)

      const lockAddresses = await borrowerBtcChain.client.loan.collateral.getLockAddresses(lockParams[1], lockParams[2], lockParams[3])
      console.log('lockAddresses', lockAddresses)
      const { refundableAddress, seizableAddress } = lockAddresses
      await importBitcoinAddressesByAddress([refundableAddress, seizableAddress])

      await chains.bitcoinWithNode.client.chain.generateBlock(1)

      await lenderLoans.methods.approve(loan).send({ gas: 2000000 })
      await borrowerLoans.methods.withdraw(loan, borSecs[0]).send({ gas: 2000000 })

      const medValue = await medianizer.methods.read().call()
      console.log('medValue', medValue)

      console.log('test', fromWei(hexToNumberString(medValue), 'ether'))

      const safe = await lenderLoans.methods.safe(loan).call()
      console.log('safe', safe)

      const liquidator = await getAgentAddress(liquidatorServer)

      console.log('liquidator', liquidator)

      const discountBuyPre = await lenderLoans.methods.discountCollateralValue(loan).call()
      const discountBuy = await lenderLoans.methods.ddiv(discountBuyPre).call()

      console.log('discountBuy', discountBuy)

      await fundTokens(liquidator, discountBuy, principal)

      await medianizer.methods.poke(numToBytes32(toWei((parseInt(btcPrice) * 0.7).toString(), 'ether'))).send({ gas: 2000000 })

      await checkLoanLiquidated(loanId, principal)

      const saleIndexAfter = await lenderSales.methods.saleIndex().call()

      const saleId = saleIndexAfter

      const settlementExpiration = await lenderSales.methods.settlementExpiration(numToBytes32(saleId)).call()

      const currentTime = Math.floor(new Date().getTime() / 1000)

      await increaseTime(parseInt(settlementExpiration - currentTime) + 1000)

      //   console.log('saleIndexBefore', saleIndexBefore)
      //   console.log('saleIndexAfter', saleIndexAfter)

      //   const swapSecretHashes = await getSwapSecretHashes(lenderSales, numToBytes32(saleId))
      //   console.log('swapSecretHashes', swapSecretHashes)

      //   const { collateralPublicKey: liquidatorPubKey } = await getAgentAddresses(liquidatorServer)
      //   const liquidatorPubKeyHash = hash160(liquidatorPubKey)

      //   let swapPubKeys = lockParams[1]
      //   swapPubKeys.liquidatorPubKey = liquidatorPubKey
      //   swapPubKeys.liquidatorPubKeyHash = liquidatorPubKeyHash

      //   const swapExpiration = await lenderSales.methods.swapExpiration(numToBytes32(saleId)).call()
      //   const liquidationExpiration = await lenderLoans.methods.liquidationExpiration(numToBytes32(loanId)).call()

      //   const swapExpirations = { swapExpiration, liquidationExpiration }

      //   const swapParams = [swapPubKeys, swapSecretHashes, swapExpirations]
      //   console.log('swapParams', swapParams)
      //   const lockSwapAddresses = await borrowerBtcChain.client.loan.collateralSwap.getInitAddresses(...swapParams)

      //   console.log('lockSwapAddresses', lockSwapAddresses)

      //   // const swapParams = [colParams.pubKeys, swapSecretHashes, colParams.expirations]
      //   // const lockAddresses = await bitcoin.client.loan.collateralSwap.getInitAddresses(...swapParams)

      //   await importBitcoinAddressesByAddress([lockSwapAddresses.refundableAddress, lockSwapAddresses.seizableAddress])

      //   const outputs = [{ address: lockSwapAddresses.refundableAddress }, { address: lockSwapAddresses.seizableAddress }]

      //   const multisigBorrowerParams = [lockTxHash, lockParams[1], lockParams[2], lockParams[3], 'borrower', outputs]
      //   const borrowerSigs = await borrowerBtcChain.client.loan.collateral.multisigSign(...multisigBorrowerParams)

      //   console.log('borrowerSigs', borrowerSigs)

      //   const multisigLenderParams = [lockTxHash, lockParams[1], lockParams[2], lockParams[3], 'lender', outputs]
      //   const lenderSigs = await lenderBtcChain.client.loan.collateral.multisigSign(...multisigLenderParams)

      //   const sigs = {
      //     refundable: [Buffer.from(borrowerSigs.refundableSig, 'hex'), Buffer.from(lenderSigs.refundableSig, 'hex')],
      //     seizable: [Buffer.from(borrowerSigs.seizableSig, 'hex'), Buffer.from(lenderSigs.seizableSig, 'hex')]
      //   }

      //   const multisigSendTxHash = await borrowerBtcChain.client.loan.collateral.multisigSend(lockTxHash, sigs, lockParams[1], lockParams[2], lockParams[3], outputs)
      //   console.log('multisigSendTxHash', multisigSendTxHash)

      //   await chains.bitcoinWithNode.client.chain.generateBlock(1)

    //   await arbiterSales.methods.provideSecret(numToBytes32(saleId), arbiterSecs[1]).send({ gas: 2000000 })
    //   await lenderSales.methods.provideSecret(numToBytes32(saleId), lendSecs[1]).send({ gas: 2000000 })
    })
  })
}

async function checkLoanLiquidated (loanId, principal) {
  let liquidated = false
  while (!liquidated) {
    await sleep(1000)
    const { body, status } = await chai.request(liquidatorServer).get(`/loans/contract/${principal}/${loanId}`)
    if (status === 200) {
      const { status: loanStatus } = body
      console.log(loanStatus)
      if (loanStatus === 'LIQUIDATED') {
        liquidated = true
      }
    }
  }
}

async function testSetup (web3Chain) {
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
  await importBitcoinAddresses(borrowerBtcChain)
  await fundUnusedBitcoinAddress(borrowerBtcChain)
  await restartJobs(liquidatorServer)
}

describe('Lender Agent - Funds', () => {
  describe('Web3HDWallet / BitcoinJs', () => {
    before(async function () {
      await testSetup(chains.web3WithHDWallet)
      // testSetupArbiter()
    })
    // after(function () {
    //   testAfterArbiter()
    // })
    testRefund()
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

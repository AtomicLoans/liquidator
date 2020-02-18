/* eslint-env mocha */
require('dotenv').config()
const chai = require('chai')
const mongoose = require('mongoose')
const BN = require('bignumber.js')
const toSecs = require('@mblackmblack/to-seconds')
const { sha256 } = require('@liquality/crypto')

const { chains, importBitcoinAddresses, fundUnusedBitcoinAddress, importBitcoinAddressesByAddress } = require('../../common')
const { updateCollateralValues, updateMinCollateralValues } = require('../../../src/worker/loan/loans/status')

const Loan = require('../../../src/models/Loan')
const LoanMarket = require('../../../src/models/LoanMarket')

chai.should()
const expect = chai.expect

const { MONGODB_TEST_URI } = process.env
let secrets

const BTC_TO_SATS = 10 ** 8

function testLoanStatus (web3Chain, btcChain) {
  describe('updateCollateralValues', () => {
    beforeEach(async function () {
      const params = { principal: 'DAI', collateral: 'BTC', principalAmount: BN(10).pow(18).toFixed(), loanDuration: toSecs({ days: 2 }) }
      const loanMarket = new LoanMarket({ minConf: 1, requestExpiresIn: 600000 })
      await loanMarket.save()

      const minCollateralAmount = BN(10).pow(8).toFixed()

      const loan = Loan.fromLoanMarket(loanMarket, params, minCollateralAmount)
      await loan.save()

      const lockParams = await getLockParams()

      const { refundableAddress, seizableAddress } = await btcChain.client.loan.collateral.getLockAddresses(...lockParams)

      loan.collateralRefundableP2SHAddress = refundableAddress
      loan.collateralSeizableP2SHAddress = seizableAddress
      await loan.save()

      await importBitcoinAddressesByAddress([refundableAddress, seizableAddress])

      global.loan = loan
      global.loanMarket = loanMarket
      global.lockParams = lockParams
      global.values = {
        refundableValue: 1000000, // 0.01 BTC
        seizableValue: 500000 // 0.005 BTC
      }
    })

    it('should increase totalCollateralValue in loanMarket and collateral value in Loan if refundable and seizable amounts increased', async () => {
      const { loan, loanMarket, values, lockParams } = global

      await updateCollateralValues([loan], loanMarket)

      const { totalCollateralValue: totalCollateralValueBeforeInBTC } = loanMarket
      const totalCollateralValueBefore = BN(totalCollateralValueBeforeInBTC).times(BTC_TO_SATS).toNumber()
      expect(totalCollateralValueBefore).to.equal(0)

      await btcChain.client.loan.collateral.lock(values, ...lockParams)
      await chains.bitcoinWithNode.client.chain.generateBlock(1)

      await updateCollateralValues([loan], loanMarket)

      const { totalCollateralValue: totalCollateralValueAfterInBTC } = loanMarket
      const totalCollateralValueAfter = BN(totalCollateralValueAfterInBTC).times(BTC_TO_SATS).toNumber()
      expect(totalCollateralValueAfter).to.equal(values.refundableValue + values.seizableValue)
    })

    it('should decrease totalCollateralValue in LoanMarket and collateralValue in Loan if refundable and seizable amounts decreased', async () => {
      const { loan, loanMarket, values, lockParams } = global

      await updateCollateralValues([loan], loanMarket)

      const lockTxHash = await btcChain.client.loan.collateral.lock(values, ...lockParams)
      await chains.bitcoinWithNode.client.chain.generateBlock(1)

      await updateCollateralValues([loan], loanMarket)

      const { totalCollateralValue: totalCollateralValueBeforeInBTC } = loanMarket
      const totalCollateralValueBefore = BN(totalCollateralValueBeforeInBTC).times(BTC_TO_SATS).toNumber()
      expect(totalCollateralValueBefore).to.equal(values.refundableValue + values.seizableValue)

      const unlockParams = await getUnlockParams(lockParams, secrets[1])

      await btcChain.client.loan.collateral.refundMany([lockTxHash], ...unlockParams)
      await chains.bitcoinWithNode.client.chain.generateBlock(1)

      await updateCollateralValues([loan], loanMarket)

      const { totalCollateralValue: totalCollateralValueAfterInBTC } = loanMarket
      const totalCollateralValueAfter = BN(totalCollateralValueAfterInBTC).times(BTC_TO_SATS).toNumber()
      expect(totalCollateralValueAfter).to.equal(0)
    })

    it('should only increase refundableCollateralValue if only refundable collateral was locked', async () => {
      const { loan, loanMarket, values, lockParams } = global

      await updateCollateralValues([loan], loanMarket)

      const lockTxHash = await btcChain.client.loan.collateral.lockRefundable(values.refundableValue, ...lockParams)
      await chains.bitcoinWithNode.client.chain.generateBlock(1)

      await updateCollateralValues([loan], loanMarket)

      const { totalCollateralValue: totalCollateralValueBeforeInBTC } = loanMarket
      const totalCollateralValueBefore = BN(totalCollateralValueBeforeInBTC).times(BTC_TO_SATS).toNumber()
      expect(totalCollateralValueBefore).to.equal(values.refundableValue)

      const unlockParams = await getUnlockParams(lockParams, secrets[1])

      await btcChain.client.loan.collateral.refundMany([lockTxHash], ...unlockParams)
      await chains.bitcoinWithNode.client.chain.generateBlock(1)

      await updateCollateralValues([loan], loanMarket)

      const { totalCollateralValue: totalCollateralValueAfterInBTC } = loanMarket
      const totalCollateralValueAfter = BN(totalCollateralValueAfterInBTC).times(BTC_TO_SATS).toNumber()
      expect(totalCollateralValueAfter).to.equal(0)
    })

    it('should only increase seizableCollateralValue if only seizable collateral was locked', async () => {
      const { loan, loanMarket, values, lockParams } = global

      await updateCollateralValues([loan], loanMarket)

      const lockTxHash = await btcChain.client.loan.collateral.lockSeizable(values.seizableValue, ...lockParams)
      await chains.bitcoinWithNode.client.chain.generateBlock(1)

      await updateCollateralValues([loan], loanMarket)

      const { totalCollateralValue: totalCollateralValueBeforeInBTC } = loanMarket
      const totalCollateralValueBefore = BN(totalCollateralValueBeforeInBTC).times(BTC_TO_SATS).toNumber()
      expect(totalCollateralValueBefore).to.equal(values.seizableValue)

      const unlockParams = await getUnlockParams(lockParams, secrets[1])

      await btcChain.client.loan.collateral.refundMany([lockTxHash], ...unlockParams)
      await chains.bitcoinWithNode.client.chain.generateBlock(1)

      await updateCollateralValues([loan], loanMarket)

      const { totalCollateralValue: totalCollateralValueAfterInBTC } = loanMarket
      const totalCollateralValueAfter = BN(totalCollateralValueAfterInBTC).times(BTC_TO_SATS).toNumber()
      expect(totalCollateralValueAfter).to.equal(0)
    })

    it('should set collateralLocked bool to true in Loan Model if collateral value greater than 0', async () => {
      const { loan, loanMarket, values, lockParams } = global

      await updateCollateralValues([loan], loanMarket)

      const { collateralLocked: collateralLockedBefore } = loan
      expect(collateralLockedBefore).to.equal(false)
      const { totalCollateralValue: totalCollateralValueBeforeInBTC } = loanMarket
      const totalCollateralValueBefore = BN(totalCollateralValueBeforeInBTC).times(BTC_TO_SATS).toNumber()
      expect(totalCollateralValueBefore).to.equal(0)

      await btcChain.client.loan.collateral.lock(values, ...lockParams)
      await chains.bitcoinWithNode.client.chain.generateBlock(1)

      await updateCollateralValues([loan], loanMarket)

      const { collateralLocked: collateralLockedAfter } = loan
      expect(collateralLockedAfter).to.equal(true)
      const { totalCollateralValue: totalCollateralValueAfterInBTC } = loanMarket
      const totalCollateralValueAfter = BN(totalCollateralValueAfterInBTC).times(BTC_TO_SATS).toNumber()
      expect(totalCollateralValueAfter).to.equal(values.refundableValue + values.seizableValue)
    })

    it('should set collateralLocked bool to false in Loan Model if collateral value is 0', async () => {
      const { loan, loanMarket, values, lockParams } = global

      await updateCollateralValues([loan], loanMarket)

      const lockTxHash = await btcChain.client.loan.collateral.lock(values, ...lockParams)
      await chains.bitcoinWithNode.client.chain.generateBlock(1)

      await updateCollateralValues([loan], loanMarket)

      const { collateralLocked: collateralLockedBefore } = loan
      expect(collateralLockedBefore).to.equal(true)
      const { totalCollateralValue: totalCollateralValueBeforeInBTC } = loanMarket
      const totalCollateralValueBefore = BN(totalCollateralValueBeforeInBTC).times(BTC_TO_SATS).toNumber()
      expect(totalCollateralValueBefore).to.equal(values.refundableValue + values.seizableValue)

      const unlockParams = await getUnlockParams(lockParams, secrets[1])

      await btcChain.client.loan.collateral.refundMany([lockTxHash], ...unlockParams)
      await chains.bitcoinWithNode.client.chain.generateBlock(1)

      await updateCollateralValues([loan], loanMarket)

      const { collateralLocked: collateralLockedAfter } = loan
      expect(collateralLockedAfter).to.equal(false)
      const { totalCollateralValue: totalCollateralValueAfterInBTC } = loanMarket
      const totalCollateralValueAfter = BN(totalCollateralValueAfterInBTC).times(BTC_TO_SATS).toNumber()
      expect(totalCollateralValueAfter).to.equal(0)
    })
  })

  describe('updateMinCollateralValues', () => {
    beforeEach(async function () {
      const params = { principal: 'DAI', collateral: 'BTC', principalAmount: BN(10).pow(18).toFixed(), loanDuration: toSecs({ days: 2 }) }
      const loanMarket = new LoanMarket({ minConf: 1, requestExpiresIn: 600000 })
      await loanMarket.save()

      const minCollateralAmount = BN(10).pow(8).toFixed()

      const loan = Loan.fromLoanMarket(loanMarket, params, minCollateralAmount)
      await loan.save()

      const lockParams = await getLockParams()

      const { refundableAddress, seizableAddress } = await btcChain.client.loan.collateral.getLockAddresses(...lockParams)

      loan.collateralRefundableP2SHAddress = refundableAddress
      loan.collateralSeizableP2SHAddress = seizableAddress
      await loan.save()

      await importBitcoinAddressesByAddress([refundableAddress, seizableAddress])

      global.loan = loan
      global.loanMarket = loanMarket
      global.lockParams = lockParams
      global.values = {
        refundableValue: 1000000, // 0.01 BTC
        seizableValue: 500000 // 0.005 BTC
      }
    })

    it('should succeeed and create error when ethereum chain can\'t be accessed', async () => {
      const { loan, loanMarket } = global

      await updateMinCollateralValues([loan], loanMarket)
    })
  })
}

async function getPubKey (chain) {
  const { publicKey } = await chain.client.getMethod('getUnusedAddress')()

  return publicKey.toString('hex')
}

async function getLockParams () {
  const borrowerPubKey = await getPubKey(chains.bitcoinBorrower)
  const lenderPubKey = await getPubKey(chains.bitcoinLender)
  const arbiterPubKey = await getPubKey(chains.bitcoinArbiter)
  const pubKeys = { borrowerPubKey, lenderPubKey, arbiterPubKey }

  const secretHashA1 = sha256(secrets[0])
  const secretHashB1 = sha256(secrets[1])
  const secretHashC1 = sha256(secrets[2])
  const secretHashes = { secretHashA1, secretHashB1, secretHashC1 }

  const expirations = { liquidationExpiration: 604800, seizureExpiration: 777600 }

  return [pubKeys, secretHashes, expirations]
}

async function getUnlockParams (lockParams, secret) {
  return [lockParams[0], secret, lockParams[1], lockParams[2]]
}

async function testSetup (btcChain) {
  const blockHeight = await btcChain.client.chain.getBlockHeight()
  if (blockHeight < 101) {
    await btcChain.client.chain.generateBlock(101)
  }

  await importBitcoinAddresses(btcChain)
  await fundUnusedBitcoinAddress(btcChain)
}

describe('Loan Status', () => {
  before(async function () {
    await testSetup(chains.bitcoinBorrower)
  })

  beforeEach(async function () {
    await mongoose.connect(MONGODB_TEST_URI, { useNewUrlParser: true, useCreateIndex: true })
    secrets = await chains.bitcoinBorrower.client.loan.secrets.generateSecrets(Math.random().toString(), 3)
  })

  testLoanStatus(chains.web3WithHDWallet, chains.bitcoinBorrower)

  afterEach(function (done) {
    mongoose.connection.db.dropDatabase(function () {
      mongoose.connection.close(done)
    })
  })
})

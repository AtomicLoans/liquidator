require('dotenv').config()
const config = require('./config')

const Client = require('@liquality/client')
const LoanClient = require('@atomicloans/loan-client')

const BitcoinRpcProvider = require('@liquality/bitcoin-rpc-provider')
const BitcoinJsWalletProvider = require('@liquality/bitcoin-js-wallet-provider')
const BitcoinLedgerProvider = require('@liquality/bitcoin-ledger-provider')
const BitcoinNodeWalletProvider = require('@liquality/bitcoin-node-wallet-provider')
const BitcoinCollateralProvider = require('@atomicloans/bitcoin-collateral-provider')
const BitcoinCollateralSwapProvider = require('@atomicloans/bitcoin-collateral-swap-provider')
const BitcoinNetworks = require('@liquality/bitcoin-networks')

const EthereumRpcProvider = require('@liquality/ethereum-rpc-provider')
const EthereumMetaMaskProvider = require('@liquality/ethereum-metamask-provider')
const EthereumJsWalletProvider = require('@liquality/ethereum-js-wallet-provider')
const EthereumNetworks = require('@liquality/ethereum-networks')

const MetaMaskConnector = require('node-metamask')
const Web3 = require('web3')
const HDWalletProvider = require('@truffle/hdwallet-provider')
const { generateMnemonic } = require('bip39')
const fs = require('fs')
const path = require('path')

const metaMaskConnector = new MetaMaskConnector({ port: config.ethereum.metaMaskConnector.port })

const bitcoinNetwork = BitcoinNetworks[config.bitcoin.network]

const bitcoinWithLedger = new Client()
const bitcoinLoanWithLedger = new LoanClient(bitcoinWithLedger)
bitcoinWithLedger.loan = bitcoinLoanWithLedger
bitcoinWithLedger.addProvider(new BitcoinRpcProvider(config.bitcoin.rpc.host, config.bitcoin.rpc.username, config.bitcoin.rpc.password))
bitcoinWithLedger.addProvider(new BitcoinLedgerProvider({ network: bitcoinNetwork, segwit: false }))
bitcoinWithLedger.loan.addProvider(new BitcoinCollateralProvider({ network: bitcoinNetwork }, { script: 'p2wsh', address: 'p2wpkh' }))
bitcoinWithLedger.loan.addProvider(new BitcoinCollateralSwapProvider({ network: bitcoinNetwork }, { script: 'p2wsh', address: 'p2wpkh' }))

const bitcoinWithJs = new Client()
const bitcoinLoanWithJs = new LoanClient(bitcoinWithJs)
bitcoinWithJs.loan = bitcoinLoanWithJs
bitcoinWithJs.addProvider(new BitcoinRpcProvider(config.bitcoin.rpc.host, config.bitcoin.rpc.username, config.bitcoin.rpc.password))
bitcoinWithJs.addProvider(new BitcoinJsWalletProvider(bitcoinNetwork, generateMnemonic(256), 'bech32'))
bitcoinWithJs.loan.addProvider(new BitcoinCollateralProvider({ network: bitcoinNetwork }, { script: 'p2wsh', address: 'p2wpkh' }))
bitcoinWithJs.loan.addProvider(new BitcoinCollateralSwapProvider({ network: bitcoinNetwork }, { script: 'p2wsh', address: 'p2wpkh' }))

const bitcoinWithNode = new Client()
bitcoinWithNode.addProvider(new BitcoinRpcProvider(config.bitcoin.rpc.host, config.bitcoin.rpc.username, config.bitcoin.rpc.password))
bitcoinWithNode.addProvider(new BitcoinNodeWalletProvider(bitcoinNetwork, config.bitcoin.rpc.host, config.bitcoin.rpc.username, config.bitcoin.rpc.password, 'bech32'))

const bitcoinArbiter = new Client()
const bitcoinLoanArbiter = new LoanClient(bitcoinArbiter)
bitcoinArbiter.loan = bitcoinLoanArbiter
bitcoinArbiter.addProvider(new BitcoinRpcProvider(config.bitcoin.rpc.host, config.bitcoin.rpc.username, config.bitcoin.rpc.password))
bitcoinArbiter.addProvider(new BitcoinJsWalletProvider(bitcoinNetwork, getEnvTestValue('ARBITER_MNEMONIC').toString(), 'bech32'))
bitcoinArbiter.loan.addProvider(new BitcoinCollateralProvider({ network: bitcoinNetwork }, { script: 'p2wsh', address: 'p2wpkh' }))
bitcoinArbiter.loan.addProvider(new BitcoinCollateralSwapProvider({ network: bitcoinNetwork }, { script: 'p2wsh', address: 'p2wpkh' }))

const bitcoinLender = new Client()
const bitcoinLoanLender = new LoanClient(bitcoinLender)
bitcoinLender.loan = bitcoinLoanLender
bitcoinLender.addProvider(new BitcoinRpcProvider(config.bitcoin.rpc.host, config.bitcoin.rpc.username, config.bitcoin.rpc.password))
bitcoinLender.addProvider(new BitcoinJsWalletProvider(bitcoinNetwork, getEnvTestValue('LENDER_MNEMONIC').toString(), 'bech32'))
bitcoinLender.loan.addProvider(new BitcoinCollateralProvider({ network: bitcoinNetwork }, { script: 'p2wsh', address: 'p2wpkh' }))
bitcoinLender.loan.addProvider(new BitcoinCollateralSwapProvider({ network: bitcoinNetwork }, { script: 'p2wsh', address: 'p2wpkh' }))

const bitcoinBorrower = new Client()
const bitcoinLoanBorrower = new LoanClient(bitcoinBorrower)
bitcoinBorrower.loan = bitcoinLoanBorrower
bitcoinBorrower.addProvider(new BitcoinRpcProvider(config.bitcoin.rpc.host, config.bitcoin.rpc.username, config.bitcoin.rpc.password))
bitcoinBorrower.addProvider(new BitcoinJsWalletProvider(bitcoinNetwork, getEnvTestValue('BORROWER_MNEMONIC').toString(), 'bech32'))
bitcoinBorrower.loan.addProvider(new BitcoinCollateralProvider({ network: bitcoinNetwork }, { script: 'p2wsh', address: 'p2wpkh' }))
bitcoinBorrower.loan.addProvider(new BitcoinCollateralSwapProvider({ network: bitcoinNetwork }, { script: 'p2wsh', address: 'p2wpkh' }))

const bitcoinLiquidator = new Client()
const bitcoinLoanLiquidator = new LoanClient(bitcoinLiquidator)
bitcoinLiquidator.loan = bitcoinLoanLiquidator
bitcoinLiquidator.addProvider(new BitcoinRpcProvider(config.bitcoin.rpc.host, config.bitcoin.rpc.username, config.bitcoin.rpc.password))
bitcoinLiquidator.addProvider(new BitcoinJsWalletProvider(bitcoinNetwork, getEnvTestValue('LIQUIDATOR_MNEMONIC').toString(), 'bech32'))
bitcoinLiquidator.loan.addProvider(new BitcoinCollateralProvider({ network: bitcoinNetwork }, { script: 'p2wsh', address: 'p2wpkh' }))
bitcoinLiquidator.loan.addProvider(new BitcoinCollateralSwapProvider({ network: bitcoinNetwork }, { script: 'p2wsh', address: 'p2wpkh' }))

const ethereumNetwork = EthereumNetworks[config.ethereum.network]

const ethereumWithNode = new Client()
ethereumWithNode.addProvider(new EthereumRpcProvider(config.ethereum.rpc.host))

const ethereumWithMetaMask = new Client()
ethereumWithMetaMask.addProvider(new EthereumRpcProvider(config.ethereum.rpc.host))
ethereumWithMetaMask.addProvider(new EthereumMetaMaskProvider(metaMaskConnector.getProvider()))

const ethereumArbiter = new Client()
ethereumArbiter.addProvider(new EthereumRpcProvider(config.ethereum.rpc.host))
ethereumArbiter.addProvider(new EthereumJsWalletProvider(ethereumNetwork, getEnvTestValue('ARBITER_MNEMONIC').toString()))

const web3WithMetaMask = new Web3(metaMaskConnector.getProvider())

const httpProvider = new Web3.providers.HttpProvider(config.ethereum.rpc.host)
const provider = new HDWalletProvider(getEnvTestValue('ARBITER_MNEMONIC').toString(), httpProvider)
const web3WithArbiter = new Web3(provider)

const lenderProvider = new HDWalletProvider(getEnvTestValue('LENDER_MNEMONIC').toString(), httpProvider)
const web3WithLender = new Web3(lenderProvider)

const borrowerProvider = new HDWalletProvider(getEnvTestValue('BORROWER_MNEMONIC').toString(), httpProvider)
const web3WithBorrower = new Web3(borrowerProvider)

const liquidatorProvider = new HDWalletProvider(getEnvTestValue('LIQUIDATOR_MNEMONIC').toString(), httpProvider)
const web3WithLiquidator = new Web3(liquidatorProvider)

const web3WithNode = new Web3(new Web3.providers.HttpProvider(config.ethereum.rpc.host))

const hdWalletProvider = new HDWalletProvider(getEnvTestValue('ETH_SIGNER_MNEMONIC').toString(), httpProvider)
const web3WithHDWallet = new Web3(hdWalletProvider)

const chains = {
  bitcoinWithLedger: { id: 'Bitcoin Ledger', name: 'bitcoin', client: bitcoinWithLedger },
  bitcoinWithJs: { id: 'Bitcoin Js', name: 'bitcoin', client: bitcoinWithJs, network: bitcoinNetwork },
  bitcoinWithNode: { id: 'Bitcoin Node', name: 'bitcoin', client: bitcoinWithNode, network: bitcoinNetwork },
  bitcoinArbiter: { id: 'Bitcoin Arbiter', name: 'bitcoin', client: bitcoinArbiter, network: bitcoinNetwork },
  bitcoinLender: { id: 'Bitcoin Lender', name: 'bitcoin', client: bitcoinLender, network: bitcoinNetwork },
  bitcoinBorrower: { id: 'Bitcoin Borrower', name: 'bitcoin', client: bitcoinBorrower, network: bitcoinNetwork },
  bitcoinLiquidator: { id: 'Bitcoin Liquidator', name: 'bitcoin', client: bitcoinLiquidator, network: bitcoinNetwork },
  ethereumWithNode: { id: 'Ethereum Node', name: 'ethereum', client: ethereumWithNode },
  ethereumWithMetaMask: { id: 'Ethereum MetaMask', name: 'ethereum', client: ethereumWithMetaMask },
  ethereumArbiter: { id: 'Ethereum Arbiter', name: 'ethereum', client: ethereumArbiter },
  web3WithNode: { id: 'Web3 Node', name: 'ethereum', client: web3WithNode },
  web3WithMetaMask: { id: 'Web3 MetaMask', name: 'ethereum', client: web3WithMetaMask },
  web3WithArbiter: { id: 'Web3 Arbiter', name: 'ethereum', client: web3WithArbiter },
  web3WithLender: { id: 'Web3 Lender', name: 'ethereum', client: web3WithLender },
  web3WithBorrower: { id: 'Web3 Borrower', name: 'ethereum', client: web3WithBorrower },
  web3WithLiquidator: { id: 'Web3 Liquidator', name: 'ethereum', client: web3WithLiquidator },
  web3WithHDWallet: { id: 'Web3 HDWallet', name: 'ethereum', client: web3WithHDWallet }
}

async function importBitcoinAddresses (chain) {
  const nonChangeAddresses = await chain.client.getMethod('getAddresses')(0, 100)
  const changeAddresses = await chain.client.getMethod('getAddresses')(0, 100, true)

  const addresses = [...nonChangeAddresses, ...changeAddresses]

  const addressesToImport = []
  for (const address of addresses) {
    addressesToImport.push({ scriptPubKey: { address: address.address }, timestamp: 'now' })
  }

  await chain.client.getMethod('jsonrpc')('importmulti', addressesToImport, { rescan: false })
}

async function importBitcoinAddressesByAddress (addresses) {
  const addressesToImport = []
  for (const address of addresses) {
    addressesToImport.push({ scriptPubKey: { address: address }, timestamp: 'now' })
  }

  await chains.bitcoinWithNode.client.getMethod('jsonrpc')('importmulti', addressesToImport, { rescan: false })
}

async function fundUnusedBitcoinAddress (chain) {
  const unusedAddress = await chain.client.wallet.getUnusedAddress()
  await chains.bitcoinWithNode.client.chain.sendTransaction(unusedAddress, 100000000)
  await chains.bitcoinWithNode.client.chain.generateBlock(1)
}

function getEnvTestValue (key) {
  const env = fs.readFileSync(path.resolve(process.cwd(), 'test/env/.env.test'), 'utf-8')
  const regex = new RegExp(`${key}=("(.*?)"|([0-9a-zA-Z])\\w+)`, 'g')
  const value = env.match(regex)
  return value.toString().replace(`${key}=`, '').replace('"', '').replace('"', '')
}

function rewriteEnv (envFile, key, value) {
  const env = fs.readFileSync(path.resolve(process.cwd(), envFile), 'utf-8')
  const regex = new RegExp(`${key}=("(.*?)"|([0-9a-zA-Z])\\w+)`, 'g')
  const newEnv = env.replace(regex, `${key}=${value}`)
  fs.writeFileSync(path.resolve(process.cwd(), envFile), newEnv, 'utf-8')
}

function getWeb3Chain (mnemonic) {
  const hdWalletProvider = new HDWalletProvider(mnemonic, httpProvider)
  const hdWallet = new Web3(hdWalletProvider)
  return { client: hdWallet }
}

function connectMetaMask () {
  before(async () => {
    console.log('\x1b[36m', 'Starting MetaMask connector on http://localhost:3333 - Open in browser to continue', '\x1b[0m')
    await metaMaskConnector.start()
  })
  after(async () => metaMaskConnector.stop())
}

module.exports = {
  chains,
  connectMetaMask,
  importBitcoinAddresses,
  importBitcoinAddressesByAddress,
  fundUnusedBitcoinAddress,
  rewriteEnv,
  getWeb3Chain
}

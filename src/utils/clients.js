const Client = require('@liquality/client')
const LoanClient = require('@atomicloans/loan-client')
const { isArbiter } = require('./env')
const { contractAddresses, bitcoinNetworks } = require('../networks/index')

const {
  BTC_RPC, BTC_USER, BTC_PASS, BTC_API,
  ETH_RPC, ETH_USER, ETH_PASS,
  NETWORK, MNEMONIC, MNEMONIC_ARBITER
} = process.env

const BitcoinRpcProvider = require('@liquality/bitcoin-rpc-provider')
const BitcoinEsploraApiProvider = require('@liquality/bitcoin-esplora-api-provider')
const BitcoinJsWalletProvider = require('@liquality/bitcoin-js-wallet-provider')
const BitcoinSwapProvider = require('@liquality/bitcoin-swap-provider')
const BitcoinCollateralProvider = require('@atomicloans/bitcoin-collateral-provider')
const BitcoinCollateralSwapProvider = require('@atomicloans/bitcoin-collateral-swap-provider')
const BitcoinNetworks = require('@liquality/bitcoin-networks')

const EthereumRpcProvider = require('@liquality/ethereum-rpc-provider')
const EthereumSwapProvider = require('@liquality/ethereum-swap-provider')
const EthereumErc20Provider = require('@liquality/ethereum-erc20-provider')

const addresses = contractAddresses(NETWORK)
const bitcoinNetwork = bitcoinNetworks(NETWORK).NETWORK

const BTC = new Client()
const BTCLoan = new LoanClient(BTC)
BTC.loan = BTCLoan
BTC.addProvider(new BitcoinRpcProvider(BTC_RPC, BTC_USER, BTC_PASS))
if (NETWORK !== 'test') {
  BTC.addProvider(new BitcoinEsploraApiProvider(BTC_API))
}
BTC.addProvider(new BitcoinJsWalletProvider(BitcoinNetworks[bitcoinNetwork], isArbiter() ? MNEMONIC_ARBITER : MNEMONIC, 'bech32'))
BTC.addProvider(new BitcoinSwapProvider({ network: BitcoinNetworks[bitcoinNetwork] }))
BTC.loan.addProvider(new BitcoinCollateralProvider({ network: BitcoinNetworks[bitcoinNetwork] }))
BTC.loan.addProvider(new BitcoinCollateralSwapProvider({ network: BitcoinNetworks[bitcoinNetwork] }))

const ETH = new Client()
ETH.addProvider(new EthereumRpcProvider(ETH_RPC, ETH_USER, ETH_PASS))
ETH.addProvider(new EthereumSwapProvider())

const SAI = new Client()
SAI.addProvider(new EthereumRpcProvider(ETH_RPC, ETH_USER, ETH_PASS))
SAI.addProvider(new EthereumErc20Provider(addresses.SAI))

const DAI = new Client()
DAI.addProvider(new EthereumRpcProvider(ETH_RPC, ETH_USER, ETH_PASS))
DAI.addProvider(new EthereumErc20Provider(addresses.DAI))

const USDC = new Client()
USDC.addProvider(new EthereumRpcProvider(ETH_RPC, ETH_USER, ETH_PASS))
USDC.addProvider(new EthereumErc20Provider(addresses.USDC))

module.exports = {
  BTC,
  ETH,
  SAI,
  DAI,
  USDC
}

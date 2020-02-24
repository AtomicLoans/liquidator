const { remove0x } = require('@liquality/ethereum-utils')
const { getObject } = require('../../../utils/contracts')

async function getInitArgs (loanId, saleId, principal, collateral) {
  const loans = getObject('loans', principal)
  const sales = getObject('sales', principal)

  const { borrowerPubKey, lenderPubKey, arbiterPubKey } = await loans.methods.pubKeys(loanId).call()
  const { pubKeyHash } = await sales.methods.sales(saleId).call()

  const { secretHashA, secretHashB, secretHashC, secretHashD } = await sales.methods.secretHashes(saleId).call()

  const swapExpiration = await sales.methods.swapExpiration(saleId).call()
  const liquidationExpiration = await loans.methods.liquidationExpiration(loanId).call()

  const pubKeys = { borrowerPubKey: remove0x(borrowerPubKey), lenderPubKey: remove0x(lenderPubKey), arbiterPubKey: remove0x(arbiterPubKey), liquidatorPubKeyHash: remove0x(pubKeyHash) }
  const secretHashes = { secretHashA1: remove0x(secretHashA), secretHashB1: remove0x(secretHashB), secretHashC1: remove0x(secretHashC), secretHashD1: remove0x(secretHashD) }
  const expirations = { swapExpiration, liquidationExpiration }

  return [pubKeys, secretHashes, expirations]
}

module.exports = {
  getInitArgs
}

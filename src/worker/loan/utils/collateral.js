const BN = require('bignumber.js')
const web3 = require('web3')
const { remove0x } = require('@liquality/ethereum-utils')
const { getObject } = require('../../../utils/contracts')
const { currencies } = require('../../../../src/utils/fx')

const { fromWei } = web3.utils

async function getLockArgs (loanId, principal, collateral) {
  const loans = getObject('loans', principal)

  const { borrowerPubKey, lenderPubKey, arbiterPubKey } = await loans.methods.pubKeys(loanId).call()
  const { secretHashA1, secretHashB1, secretHashC1 } = await loans.methods.secretHashes(loanId).call()
  const approveExpiration = await loans.methods.approveExpiration(loanId).call()
  const liquidationExpiration = await loans.methods.liquidationExpiration(loanId).call()
  const seizureExpiration = await loans.methods.seizureExpiration(loanId).call()

  const pubKeys = { borrowerPubKey: remove0x(borrowerPubKey), lenderPubKey: remove0x(lenderPubKey), arbiterPubKey: remove0x(arbiterPubKey) }
  const secretHashes = { secretHashA1: remove0x(secretHashA1), secretHashB1: remove0x(secretHashB1), secretHashC1: remove0x(secretHashC1) }
  const expirations = { approveExpiration, liquidationExpiration, seizureExpiration }

  return [pubKeys, secretHashes, expirations]
}

async function getCollateralAmounts (loanId, loan, rate) {
  const { principal, collateral, collateralAmount } = loan
  const loans = getObject('loans', principal)

  const unit = currencies[principal].unit
  const colDecimals = currencies[collateral].decimals

  const owedForLoanInWei = await loans.methods.owedForLoan(loanId).call()
  const owedForLoan = fromWei(owedForLoanInWei, unit)

  const seizableCollateral = BN(owedForLoan).dividedBy(rate).toFixed(colDecimals)
  const refundableCollateral = BN(collateralAmount).minus(seizableCollateral).toFixed(colDecimals)

  return { seizableCollateral, refundableCollateral }
}

async function isCollateralRequirementsSatisfied (loan) {
  const { collateralRefundableP2SHAddress, collateralSeizableP2SHAddress, refundableCollateralAmount, seizableCollateralAmount } = loan
  const [refundableBalance, seizableBalance] = await Promise.all([
    loan.collateralClient().chain.getBalance([collateralRefundableP2SHAddress]),
    loan.collateralClient().chain.getBalance([collateralSeizableP2SHAddress])
  ])
  const collateralRequirementsMet = (refundableBalance.toNumber() >= refundableCollateralAmount && seizableBalance.toNumber() >= seizableCollateralAmount)
  return collateralRequirementsMet
}

module.exports = {
  getLockArgs,
  getCollateralAmounts,
  isCollateralRequirementsSatisfied
}

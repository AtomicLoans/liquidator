const web3 = require('web3')
const axios = require('axios')
const { ensure0x } = require('@liquality/ethereum-utils')
const compareVersions = require('compare-versions')
const { currencies } = require('../../../utils/fx')
const { rateToSec } = require('../../../utils/finance')
const { getEndpoint } = require('../../../utils/endpoints')
const { getMarketModels } = require('./models')
const { toWei } = web3.utils

async function getFundParams (fund) {
  const {
    principal, collateral, custom
  } = fund

  const { loanMarket } = await getMarketModels(principal, collateral)
  const { principalAddress } = await loanMarket.getAgentAddresses()
  const lenderAddress = ensure0x(principalAddress)

  const unit = currencies[principal].unit

  let safePrincipal = principal
  if (principal === 'SAI') {
    const { data: versionData } = await axios.get(`${getEndpoint('ARBITER_ENDPOINT')}/version`)
    const { version } = versionData

    if (!compareVersions(version, '0.1.31', '>')) {
      safePrincipal = 'DAI'
    }
  }

  const { data: agentAddresses } = await axios.get(`${getEndpoint('ARBITER_ENDPOINT')}/agentinfo/ticker/${safePrincipal}/${collateral}`)
  const { principalAddress: arbiterAddress } = agentAddresses

  let fundParams
  if (custom) {
    fundParams = getCustomFundParams(fund, lenderAddress, unit, arbiterAddress, loanMarket)
  } else {
    fundParams = getRegularFundParams(fund, lenderAddress, unit, arbiterAddress)
  }

  return { fundParams, lenderAddress }
}

function getRegularFundParams (fund, lenderAddress, unit, arbiterAddress) {
  const { maxLoanDuration, fundExpiry, compoundEnabled, amountToDepositOnCreate } = fund

  return [
    maxLoanDuration,
    fundExpiry,
    arbiterAddress,
    compoundEnabled,
    toWei(amountToDepositOnCreate.toString(), unit)
  ]
}

function getCustomFundParams (fund, lenderAddress, unit, arbiterAddress, loanMarket) {
  const {
    maxLoanDuration, fundExpiry, compoundEnabled, liquidationRatio, interest, penalty, fee, amountToDepositOnCreate
  } = fund
  const { minPrincipal, maxPrincipal, minLoanDuration } = loanMarket

  return [
    toWei(minPrincipal.toString(), unit),
    toWei(maxPrincipal.toString(), unit),
    minLoanDuration,
    maxLoanDuration,
    fundExpiry,
    toWei((liquidationRatio / 100).toString(), 'gether'), // 150% collateralization ratio
    toWei(rateToSec(interest.toString()), 'gether'), // 16.50%
    toWei(rateToSec(penalty.toString()), 'gether'), //  3.00%
    toWei(rateToSec(fee.toString()), 'gether'), //  0.75%
    arbiterAddress,
    compoundEnabled,
    toWei(amountToDepositOnCreate.toString(), unit)
  ]
}

module.exports = {
  getFundParams
}

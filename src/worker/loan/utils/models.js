const LoanMarket = require('../../../models/LoanMarket')
const Market = require('../../../models/Market')
require('../../../models/Email')
const AddressEmail = require('../../../models/AddressEmail')

async function getMarketModels (principal, collateral) {
  const loanMarket = await LoanMarket.findOne({ principal, collateral }).exec()
  if (!loanMarket) return console.log('Error: Loan Market not found')

  const market = await Market.findOne({ from: collateral, to: principal }).exec()
  if (!market) return console.log('Error: Market not found')

  return { loanMarket, market }
}

async function getEmails (addressEmail) {
  console.log('Finding emails for ', addressEmail)
  const res = await AddressEmail.findOne({ address: addressEmail }).populate({ path: 'emails', model: 'Email' }).exec()
  console.log(res)
  return res ? res.emails : []
}

module.exports = {
  getMarketModels,
  getEmails
}

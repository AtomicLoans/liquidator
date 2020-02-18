const defineFundsRouter = require('./funds')
const defineLoansRouter = require('./loans')
const defineWithdrawRoutes = require('./withdraw')

// TODO: fix http error response codes in all routes

function defineLenderRoutes (router) {
  defineFundsRouter(router)
  defineLoansRouter(router)
  defineWithdrawRoutes(router)
}

module.exports = defineLenderRoutes

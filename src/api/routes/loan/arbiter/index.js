const defineAgentsRouter = require('./agents')
const defineLoansRouter = require('./loans')
const defineSalesRouter = require('./sales')
const defineMailerRouter = require('./mailer')

// TODO: fix http error response codes in all routes

function defineArbiterRoutes (router) {
  defineAgentsRouter(router)
  defineLoansRouter(router)
  defineSalesRouter(router)
  defineMailerRouter(router)
}

module.exports = defineArbiterRoutes

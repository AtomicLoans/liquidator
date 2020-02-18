const asyncHandler = require('express-async-handler')

const Loan = require('../../../../models/Loan')

function defineLoansRouter (router) {
  router.get('/loans', asyncHandler(async (req, res) => {
    const result = await Loan.find().exec()

    res.json(result.map(r => r.json()))
  }))

  router.get('/loans/contract/:principal/:loanId', asyncHandler(async (req, res, next) => {
    const { params } = req
    const { principal, loanId } = params

    const loan = await Loan.findOne({ principal, loanId }).exec()
    if (!loan) return next(res.createError(401, 'Loan not found'))

    res.json(loan.json())
  }))
}

module.exports = defineLoansRouter

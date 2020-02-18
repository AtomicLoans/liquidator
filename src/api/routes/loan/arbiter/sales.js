const asyncHandler = require('express-async-handler')

const Loan = require('../../../../models/Loan')

function defineSalesRouter (router) {
  router.post('/sales/new', asyncHandler(async (req, res, next) => {
    console.log('start /sales/new')
    const agenda = req.app.get('agenda')
    const { body } = req
    const { principal, loanId, lenderSigs, refundableAmount, seizableAmount } = body

    // TODO: implement verify signature for creating a new sales

    const loan = await Loan.findOne({ principal, loanId }).exec()
    if (!loan) return next(res.createError(401, 'Loan not found'))

    await agenda.now('init-liquidation', { loanModelId: loan.id, lenderSigs, refundableAmount, seizableAmount })

    res.json({ message: 'success' })

    console.log('end /sales/new')
  }))
}

module.exports = defineSalesRouter

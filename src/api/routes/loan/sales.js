const asyncHandler = require('express-async-handler')
const Sale = require('../../../models/Sale')

function defineSalesRouter (router) {
  router.get('/sales', asyncHandler(async (req, res) => {
    const result = await Sale.find().exec()

    res.json(result.map(r => r.json()))
  }))

  router.get('/sales/contract/:principal/:saleId', asyncHandler(async (req, res, next) => {
    const { params } = req
    let { principal, saleId } = params

    if (principal === 'DAI') {
      principal = 'SAI'
    }

    const sale = await Sale.findOne({ principal, saleId }).exec()
    if (!sale) return next(res.createError(401, 'Sale not found'))

    res.json(sale.json())
  }))
}

module.exports = defineSalesRouter

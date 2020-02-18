const mongoose = require('mongoose')

const AgentFundSchema = new mongoose.Schema({
  principalAddress: {
    type: String,
    index: true
  },
  principal: {
    type: String,
    index: true
  },
  collateral: {
    type: String,
    index: true
  },
  utilizationRatio: {
    type: Number,
    index: true
  },
  marketLiquidity: {
    type: Number,
    index: true
  },
  borrowed: {
    type: Number,
    index: true
  },
  supplied: {
    type: Number,
    index: true
  },
  fundId: {
    type: Number,
    index: true
  },
  url: {
    type: String,
    index: true
  },
  maxLoanLengthTimestamp: {
    type: Number,
    index: true
  },
  ethBalance: {
    type: Number,
    index: true
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE'],
    index: true
  }
})

AgentFundSchema.methods.json = function () {
  const json = this.toJSON()
  json.id = json._id

  delete json._id
  delete json.__v

  return json
}

AgentFundSchema.static('fromAgentFundParams', function (params) {
  return new AgentFund({
    principalAddress: params.principalAddress,
    principal: params.principal,
    collateral: params.collateral,
    utilizationRatio: params.utilizationRatio,
    marketLiquidity: params.marketLiquidity,
    borrowed: params.borrowed,
    supplied: params.supplied,
    fundId: params.fundId,
    url: params.url,
    maxLoanLengthTimestamp: params.maxLoanLengthTimestamp,
    ethBalance: params.ethBalance,
    status: 'ACTIVE'
  })
})

const AgentFund = mongoose.model('AgentFund', AgentFundSchema)
module.exports = AgentFund

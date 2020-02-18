const mongoose = require('mongoose')

const FundSchema = new mongoose.Schema({
  principal: {
    type: String,
    index: true
  },
  collateral: {
    type: String,
    index: true
  },
  lenderAddress: {
    type: String,
    index: true
  },
  minLoanAmount: {
    type: Number,
    index: true
  },
  maxLoanAmount: {
    type: Number,
    index: true
  },
  minLoanDuration: {
    type: Number,
    index: true
  },
  maxLoanDuration: {
    type: Number,
    index: true
  },
  fundExpiry: {
    type: Number,
    index: true
  },
  liquidationRatio: {
    type: Number,
    index: true
  },
  interest: {
    type: Number,
    index: true
  },
  penalty: {
    type: Number,
    index: true
  },
  fee: {
    type: Number
  },
  balance: {
    type: Number,
    index: true
  },
  cBalance: {
    type: Number,
    index: true
  },
  custom: {
    type: Boolean,
    index: true
  },
  compoundEnabled: {
    type: Boolean,
    index: true
  },
  confirmed: {
    type: Boolean,
    index: true
  },
  createTxHash: {
    type: String,
    index: true
  },
  amountToDepositOnCreate: {
    type: Number,
    index: true
  },
  nonce: {
    type: Number,
    index: true,
    default: 0
  },
  fundId: {
    type: Number,
    index: true
  },
  ethTxId: {
    type: String,
    index: true
  },
  depositTxs: {
    type: [String],
    index: true
  },
  status: {
    type: String,
    enum: ['INITIATED', 'WAITING_FOR_APPROVE', 'CREATING', 'CREATED', 'FAILED'],
    index: true
  },
  netDeposit: {
    type: Number,
    default: 0
  }
})

FundSchema.methods.json = function () {
  const json = this.toJSON()
  json.id = json._id

  delete json._id
  delete json.__v

  return json
}

FundSchema.static('fromCustomFundParams', function (params) {
  return new Fund({
    principal: params.principal,
    collateral: params.collateral,
    custom: params.custom,
    maxLoanDuration: params.maxLoanDuration,
    fundExpiry: params.fundExpiry,
    compoundEnabled: params.compoundEnabled,
    liquidationRatio: params.liquidationRatio,
    interest: params.interest,
    penalty: params.penalty,
    fee: params.fee,
    amountToDepositOnCreate: params.amount,
    netDeposit: params.amount,
    status: 'INITIATED'
  })
})

FundSchema.static('fromFundParams', function (params) {
  return new Fund({
    principal: params.principal,
    collateral: params.collateral,
    custom: params.custom,
    maxLoanDuration: params.maxLoanDuration,
    fundExpiry: params.fundExpiry,
    compoundEnabled: params.compoundEnabled,
    amountToDepositOnCreate: params.amount,
    netDeposit: params.amount,
    status: 'INITIATED'
  })
})

const Fund = mongoose.model('Fund', FundSchema)
module.exports = Fund

const mongoose = require('mongoose')

const DepositSchema = new mongoose.Schema({
  fundModelId: {
    type: String,
    index: true
  },
  fundId: {
    type: String,
    index: true
  },
  amount: {
    type: Number,
    index: true
  },
  depositTxHash: {
    type: String,
    index: true
  },
  ethTxId: {
    type: String,
    index: true
  },
  saleId: {
    type: Number,
    index: true
  },
  createdAt: {
    type: Number,
    index: true
  },
  status: {
    type: String,
    enum: ['INITIATED', 'DEPOSITING', 'DEPOSITED', 'FAILED'],
    index: true
  }
})

DepositSchema.methods.json = function () {
  const json = this.toJSON()
  json.id = json._id

  delete json._id
  delete json.__v

  return json
}

DepositSchema.static('fromTxParams', function (params) {
  const currentTime = Math.floor(new Date().getTime() / 1000)

  return new Deposit({
    fundModelId: params.fundModelId,
    fundId: params.fundId,
    amount: params.amount,
    ethTxId: params.ethTxId,
    createdAt: currentTime,
    status: 'INITIATED'
  })
})

const Deposit = mongoose.model('Deposit', DepositSchema)
module.exports = Deposit

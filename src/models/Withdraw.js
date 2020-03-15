const mongoose = require('mongoose')

const WithdrawSchema = new mongoose.Schema({
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
  withdrawTxHash: {
    type: String,
    index: true
  },
  ethTxId: {
    type: String,
    index: true
  },
  status: {
    type: String,
    enum: ['INITIATED', 'WITHDRAWING', 'WITHDRAWN', 'FAILED'],
    index: true
  }
})

WithdrawSchema.methods.json = function () {
  const json = this.toJSON()
  json.id = json._id

  delete json._id
  delete json.__v

  return json
}

WithdrawSchema.static('fromTxParams', function () {
  return new Withdraw({
    status: 'INITIATED'
  })
})

const Withdraw = mongoose.model('Withdraw', WithdrawSchema)
module.exports = Withdraw

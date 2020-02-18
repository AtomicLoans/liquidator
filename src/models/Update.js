const mongoose = require('mongoose')

const UpdateSchema = new mongoose.Schema({
  fundModelId: {
    type: String,
    index: true
  },
  fundId: {
    type: String,
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
  arbiter: {
    type: String,
    index: true
  },
  updateTxHash: {
    type: String,
    index: true
  },
  ethTxId: {
    type: String,
    index: true
  },
  status: {
    type: String,
    enum: ['INITIATED', 'UPDATING', 'UPDATED', 'FAILED'],
    index: true
  }
})

UpdateSchema.methods.json = function () {
  const json = this.toJSON()
  json.id = json._id

  delete json._id
  delete json.__v

  return json
}

UpdateSchema.static('fromTxParams', function (params) {
  return new Update({
    fundModelId: params.fundModelId,
    fundId: params.fundId,
    maxLoanDuration: params.maxLoanDuration,
    fundExpiry: params.fundExpiry,
    arbiter: params.arbiter,
    ethTxId: params.ethTxId,
    status: 'INITIATED'
  })
})

const Update = mongoose.model('Update', UpdateSchema)
module.exports = Update

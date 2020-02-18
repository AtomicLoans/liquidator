const mongoose = require('mongoose')
const timestamps = require('mongoose-timestamp')

const EthTxSchema = new mongoose.Schema({
  from: {
    type: String,
    index: true
  },
  to: {
    type: String,
    index: true
  },
  gasLimit: {
    type: Number,
    index: true
  },
  gasPrice: {
    type: Number,
    index: true
  },
  data: {
    type: String
  },
  value: {
    type: String,
    default: '0'
  },
  nonce: {
    type: Number,
    index: true
  },
  error: {
    type: String
  },
  failed: {
    type: Boolean,
    index: true,
    default: false
  },
  overWritten: {
    type: Boolean,
    index: true,
    default: false
  },
  status: {
    type: String,
    enum: ['QUOTE', 'REQUESTING', 'AWAITING_COLLATERAL', 'APPROVING', 'APPROVED', 'CANCELLING', 'CANCELLED', 'ACCEPTING', 'ACCEPTED', 'AGENT_CLAIMED', 'FAILED'],
    index: true
  }
})

EthTxSchema.methods.json = function () {
  const json = this.toJSON()
  json.id = json._id

  delete json._id
  delete json.__v

  return json
}

EthTxSchema.static('fromTxParams', function (params) {
  return new EthTx(params)
})

EthTxSchema.plugin(timestamps)
const EthTx = mongoose.model('EthTx', EthTxSchema)
module.exports = EthTx

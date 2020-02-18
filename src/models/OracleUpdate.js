const mongoose = require('mongoose')

const OracleUpdateSchema = new mongoose.Schema({
  ethTxId: {
    type: String,
    index: true
  },
  oldPrice: {
    type: Number,
    index: true
  },
  newPrice: {
    type: Number,
    index: true
  },
  oracleUpdateTxHash: {
    type: String,
    index: true
  },
  status: {
    type: String,
    enum: ['INITIATED', 'SETTING', 'SET', 'FAILED'],
    index: true
  }
})

OracleUpdateSchema.methods.json = function () {
  const json = this.toJSON()
  json.id = json._id

  delete json._id
  delete json.__v

  return json
}

OracleUpdateSchema.static('fromOracleUpdate', function (oldPrice, newPrice) {
  return new OracleUpdate({
    oldPrice,
    newPrice
  })
})

const OracleUpdate = mongoose.model('OracleUpdate', OracleUpdateSchema)
module.exports = OracleUpdate

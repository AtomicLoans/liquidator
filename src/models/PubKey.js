const mongoose = require('mongoose')

const PubKeySchema = new mongoose.Schema({
  ethTxId: {
    type: String,
    index: true
  },
  pubKey: {
    type: String,
    index: true
  },
  pubKeyTxHash: {
    type: String,
    index: true
  },
  status: {
    type: String,
    enum: ['INITIATED', 'SETTING', 'SET', 'FAILED'],
    index: true
  }
})

PubKeySchema.methods.json = function () {
  const json = this.toJSON()
  json.id = json._id

  delete json._id
  delete json.__v

  return json
}

PubKeySchema.static('fromPubKey', function (pubKey) {
  return new PubKey({
    pubKey
  })
})

const PubKey = mongoose.model('PubKey', PubKeySchema)
module.exports = PubKey

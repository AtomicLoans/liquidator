const mongoose = require('mongoose')

const SecretsSchema = new mongoose.Schema({
  secretHashesCount: {
    type: Number,
    index: true
  },
  principal: {
    type: String,
    index: true
  },
  oldPrincipal: {
    type: String,
    index: true
  },
  ethTxId: {
    type: String,
    index: true
  },
  generateTxHash: {
    type: String,
    index: true
  },
  status: {
    type: String,
    enum: ['INITIATED', 'GENERATING', 'GENERATED', 'FAILED'],
    index: true
  }
})

SecretsSchema.methods.json = function () {
  const json = this.toJSON()
  json.id = json._id

  delete json._id
  delete json.__v

  return json
}

SecretsSchema.static('fromSecretHashesCount', function (secretHashesCount) {
  return new Secrets({
    secretHashesCount
  })
})

const Secrets = mongoose.model('Secrets', SecretsSchema)
module.exports = Secrets

const mongoose = require('mongoose')

const SecretSchema = new mongoose.Schema({
  secret: {
    type: String
  },
  secretHash: {
    type: String,
    index: true
  },
  message: {
    type: String,
    index: true
  },
  index: {
    type: Number,
    index: true
  },
  contractIndex: {
    type: Number,
    index: true
  }
})

SecretSchema.static('fromSecretParams', function (secret, secretHash, message, index, contractIndex) {
  return new Secret({
    secret,
    secretHash,
    message,
    index,
    contractIndex
  })
})

const Secret = mongoose.model('Secret', SecretSchema)
module.exports = Secret

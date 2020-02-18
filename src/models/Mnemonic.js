const mongoose = require('mongoose')

const MnemonicSchema = new mongoose.Schema({
  mnemonic: {
    type: String
  },
  heroku_api_key: {
    type: String
  }
})

const Mnemonic = mongoose.model('Mnemonic', MnemonicSchema)
module.exports = Mnemonic

const mongoose = require('mongoose')

const AddressEmailSchema = new mongoose.Schema({
  address: {
    type: String,
    index: true
  },
  emails: [{
    type: mongoose.Schema.Types.ObjectId, ref: 'Email'
  }]
})

AddressEmailSchema.methods.json = function () {
  const json = this.toJSON()
  json.id = json._id

  delete json._id
  delete json.__v

  return json
}

AddressEmailSchema.static('fromAddressEmail', function (address) {
  return new AddressEmail({
    address
  })
})

const AddressEmail = mongoose.model('AddressEmail', AddressEmailSchema)
module.exports = AddressEmail

const mongoose = require('mongoose')
require('mongoose-type-email')

const EmailSchema = new mongoose.Schema({
  email: {
    type: mongoose.SchemaTypes.Email,
    required: true,
    index: true
  },
  addressEmails: [{
    type: mongoose.Schema.Types.ObjectId, ref: 'AddressEmail'
  }]
})

EmailSchema.methods.json = function () {
  const json = this.toJSON()
  json.id = json._id

  delete json._id
  delete json.__v

  return json
}

EmailSchema.static('fromEmail', function (email) {
  return new Email({
    email
  })
})

const Email = mongoose.model('Email', EmailSchema)
module.exports = Email

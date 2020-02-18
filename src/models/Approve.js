const mongoose = require('mongoose')

const ApproveSchema = new mongoose.Schema({
  fundModelId: {
    type: String,
    index: true
  },
  fundId: {
    type: String,
    index: true
  },
  principal: {
    type: String,
    index: true
  },
  approveTxHash: {
    type: String,
    index: true
  },
  ethTxId: {
    type: String,
    index: true
  },
  status: {
    type: String,
    enum: ['INITIATED', 'APPROVING', 'APPROVED', 'FAILED'],
    index: true,
    default: 'INITIATED'
  }
})

ApproveSchema.methods.json = function () {
  const json = this.toJSON()
  json.id = json._id

  delete json._id
  delete json.__v

  return json
}

ApproveSchema.static('fromPrincipal', function (params) {
  return new Approve({
    principal: params.principal,
    status: 'INITIATED'
  })
})

const Approve = mongoose.model('Approve', ApproveSchema)
module.exports = Approve

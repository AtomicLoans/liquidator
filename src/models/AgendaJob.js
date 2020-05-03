const mongoose = require('mongoose')

const AgendaJobSchema = new mongoose.Schema({
  name: {
    type: String,
    index: true
  },
  data: {
    fundModelId: String,
    loanModelId: String,
    saleModelId: String,
    approveModelId: String,
    oracleUpdateId: String,
    secretsModelId: String,
    withdrawModelId: String,
    updateModelId: String,
    pubKeyId: String,
    depositModelId: String
  }
}, { collection: 'agendaJobs' })

AgendaJobSchema.methods.json = function () {
  const json = this.toJSON()
  json.id = json._id

  delete json._id
  delete json.__v

  return json
}

const AgendaJob = mongoose.model('AgendaJob', AgendaJobSchema)
module.exports = AgendaJob

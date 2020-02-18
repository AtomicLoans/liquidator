const { getEmails } = require('./models')
const { isArbiter } = require('../../../utils/env')

module.exports = agenda => ({
  notify: async (addressEmail, event, data) => {
    if (!isArbiter()) return
    console.log(addressEmail, event, data)
    const emails = await getEmails(addressEmail)
    if (!emails || emails.length === 0) return

    agenda.now(`mail-${event}`, { emails: [...emails], ...data })
  }
})

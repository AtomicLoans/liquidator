const { sleep } = require('@liquality/utils')
const isCI = require('is-ci')
const { cancelJobs } = require('../../loanCommon')

if (!isCI) {
  describe('Cancel all jobs', () => {
    it('should cancel all jobs', async () => {
      await cancelJobs()
      await sleep(2000)
    })
  })
}

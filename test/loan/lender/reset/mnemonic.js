const { generateMnemonic } = require('bip39')
const isCI = require('is-ci')
const { rewriteEnv } = require('../../../common')

if (!isCI) {
  describe('Reset Mnemonic', () => {
    it('should generate Mnemonic and insert into .env', async () => {
      rewriteEnv('.env', 'MNEMONIC', `"${generateMnemonic(128)}"`)
    })
  })
}

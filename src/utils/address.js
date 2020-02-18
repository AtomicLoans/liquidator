if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}

const { checksumEncode } = require('@liquality/ethereum-utils')

function getEthSigner () {
  checkEnv()
  return checksumEncode(process.env.METAMASK_ETH_ADDRESS)
}

function checkEnv () {
  if (process.env.NODE_ENV === 'test') {
    const fs = require('fs')
    const path = require('path')
    const env = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf-8')
    process.env.METAMASK_ETH_ADDRESS = env.match(/METAMASK_ETH_ADDRESS=([0-9a-z])\w+/g).toString().replace('METAMASK_ETH_ADDRESS=', '')
  }
}

module.exports = {
  getEthSigner
}

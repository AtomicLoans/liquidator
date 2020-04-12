const mainnetAddresses = require('../config/addresses/mainnet.json')
const mainnetEndpoints = require('../config/endpoints/mainnet.json')
const mainnetIntervals = require('../config/intervals/mainnet.json')
const mainnetBitcoin = require('../config/bitcoin/mainnet.json')
const mainnetVersion = require('../config/versions/mainnet.json')

const kovanAddresses = require('../config/addresses/kovan.json')
const kovanEndpoints = require('../config/endpoints/kovan.json')
const kovanIntervals = require('../config/intervals/kovan.json')
const kovanBitcoin = require('../config/bitcoin/kovan.json')
const kovanVersion = require('../config/versions/kovan.json')

function contractAddresses (network) {
  if (network === 'mainnet') {
    return mainnetAddresses
  } else if (network === 'kovan') {
    return kovanAddresses
  } else if (network === 'test') {
    const testAddresses = require('../config/addresses/test.json')
    return testAddresses
  }
}

function endpoints (network) {
  if (network === 'mainnet') {
    return mainnetEndpoints
  } else if (network === 'kovan') {
    return kovanEndpoints
  } else if (network === 'test') {
    const testEndpoints = require('../config/endpoints/test.json')
    return testEndpoints
  }
}

function intervals (network) {
  if (network === 'mainnet') {
    return mainnetIntervals
  } else if (network === 'kovan') {
    return kovanIntervals
  } else if (network === 'test') {
    const testIntervals = require('../config/intervals/test.json')
    return testIntervals
  }
}

function bitcoinNetworks (network) {
  if (network === 'mainnet') {
    return mainnetBitcoin
  } else if (network === 'kovan') {
    return kovanBitcoin
  } else if (network === 'test') {
    const testBitcoin = require('../config/bitcoin/test.json')
    return testBitcoin
  }
}

function ethereumNetworks (network) {
  if (network === 'test') {
    return 'local'
  } else {
    return network
  }
}

function versions (network) {
  if (network === 'mainnet') {
    return mainnetVersion
  } else if (network === 'kovan') {
    return kovanVersion
  } else if (network === 'test') {
    const testVersion = require('../config/versions/test.json')
    return testVersion
  }
}

module.exports = {
  contractAddresses,
  endpoints,
  intervals,
  bitcoinNetworks,
  ethereumNetworks,
  versions
}

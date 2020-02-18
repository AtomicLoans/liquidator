const version = require('../../../src/config/versions/test.json').VERSION

const schema = {}

schema.funds = require(`../../../src/abi/${version}/funds`)
schema.loans = require(`../../../src/abi/${version}/loans`)
schema.sales = require(`../../../src/abi/${version}/sales`)
schema.ctoken = require('../../../src/abi/ctoken')
schema.erc20 = require('../../../src/abi/erc20')
schema.medianizer = require('../../../src/abi/medianizer')
schema.ondemandspv = require('../../../src/abi/ondemandspv')

function testLoadObject (type, address, chain, from) {
  if (from) {
    return new chain.client.eth.Contract(schema[type].abi, address, { from })
  } else {
    return new chain.client.eth.Contract(schema[type].abi, address)
  }
}

module.exports = {
  testLoadObject
}

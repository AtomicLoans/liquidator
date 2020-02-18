const getWeb3 = require('./web3')
const { contractAddresses, versions } = require('../networks/index')

const addresses = contractAddresses(process.env.NETWORK)
const version = versions(process.env.NETWORK).VERSION

const schema = {}

schema.funds = require(`../abi/${version}/funds`)
schema.loans = require(`../abi/${version}/loans`)
schema.sales = require(`../abi/${version}/sales`)
schema.erc20 = require('../abi/erc20')
schema.ctoken = require('../abi/ctoken')
schema.medianizer = require('../abi/medianizer')
schema.oracle = require('../abi/oracle')
schema.fundoracles = require('../abi/fundoracles')

function loadObject (type, address) {
  const web3 = getWeb3()
  return new web3.eth.Contract(schema[type].abi, address)
}

function getContract (contract, principal) {
  if (contract === 'medianizer' || contract === 'fundoracles') {
    return addresses[`${contract.toUpperCase()}`]
  } else if (contract === 'erc20' || contract === 'ctoken') {
    const cPrefix = contract === 'ctoken' ? 'C' : ''
    return addresses[`${cPrefix}${principal}`]
  } else {
    return addresses[`${principal}_${contract.toUpperCase()}`]
  }
}

function getObject (contract, principal) {
  return loadObject(contract, getContract(contract, principal))
}

function getObjects (contracts, principal) {
  const objects = []
  for (const contract of contracts) {
    const object = getObject(contract, principal)
    objects.push(object)
  }
  return objects
}

module.exports = {
  loadObject,
  getContract,
  getObject,
  getObjects
}

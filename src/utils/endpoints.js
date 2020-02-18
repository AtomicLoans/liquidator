const { endpoints } = require('../networks/index')

const networkEndpoints = endpoints(process.env.NETWORK)

function getEndpoint (endpoint) {
  return networkEndpoints[endpoint]
}

module.exports = {
  getEndpoint
}

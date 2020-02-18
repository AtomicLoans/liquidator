const { intervals } = require('../networks/index')

const networkIntervals = intervals(process.env.NETWORK)

function getInterval (interval) {
  return networkIntervals[interval]
}

module.exports = {
  getInterval
}

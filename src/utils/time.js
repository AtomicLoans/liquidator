const web3 = require('./web3')

async function getCurrentTime () {
  const latestBlockNumber = await web3().eth.getBlockNumber()

  const latestBlock = await web3().eth.getBlock(latestBlockNumber)

  let latestBlockTimestamp
  if (latestBlock) {
    latestBlockTimestamp = latestBlock.timestamp
  } else {
    const almostLatestBlock = await web3().eth.getBlock(latestBlockNumber - 1)
    latestBlockTimestamp = almostLatestBlock.timestamp
  }

  return latestBlockTimestamp
}

module.exports = {
  getCurrentTime
}

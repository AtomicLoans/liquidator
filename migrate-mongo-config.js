if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}

const { MONGODB_ARBITER_URI, MONGODB_URI } = process.env
const { isArbiter } = require('./src/utils/env')

const regex = new RegExp(`\/([A-Z0-9a-z\_])*$`, 'g') // eslint-disable-line

const mongodbURI = isArbiter() ? MONGODB_ARBITER_URI : MONGODB_URI

const mongoUrl = mongodbURI.replace(regex, '')
const mongoDBName = mongodbURI.replace(mongoUrl, '').replace('/', '')

console.log('mongodbURI', mongodbURI)

const config = {
  mongodb: {
    url: mongodbURI,

    databaseName: mongoDBName,

    options: {
      useNewUrlParser: true, // removes a deprecation warning when connecting
      useUnifiedTopology: true // removes a deprecating warning when connecting
      // connectTimeoutMS: 3600000, // increase connection timeout to 1 hour
      // socketTimeoutMS: 3600000, // increase socket timeout to 1 hour
    }
  },

  // The migrations dir, can be an relative or absolute path. Only edit this when really necessary.
  migrationsDir: 'migrations',

  // The mongodb collection where the applied changes are stored. Only edit this when really necessary.
  changelogCollectionName: 'changelog'
}

// Return the config as a promise
module.exports = config

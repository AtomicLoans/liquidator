if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}

const { MONGOOSE_DEBUG, MONGODB_ARBITER_URI, MONGODB_URI, HEROKU_APP, NODE_ENV, MNEMONIC } = process.env

const { isArbiter, rewriteEnv } = require('./utils/env')
const mongoose = require('mongoose')
const { generateMnemonic } = require('bip39')
var isCI = require('is-ci')

if (MONGOOSE_DEBUG === 'true') {
  mongoose.set('debug', true)
}

const connectWithRetry = (retry) => {
  return mongoose.connect(isArbiter() ? MONGODB_ARBITER_URI : MONGODB_URI, { useNewUrlParser: true, useCreateIndex: true },
    function (err) {
      if (err && err.message && err.message.match(/failed to connect to server .* on first connect/)) {
        if (retry) {
          console.error('Failed to connect to mongo on startup - retrying in 5 sec', err)
          setTimeout(() => { connectWithRetry(false) }, 5000)
        } else {
          process.exit(2)
        }
      }
    }
  )
}

connectWithRetry(true)

async function start () {
  if (HEROKU_APP !== undefined && HEROKU_APP !== 'undefined') {
    const Mnemonic = require('./models/Mnemonic')

    const mnemonics = await Mnemonic.find().exec()
    if (mnemonics.length > 0) {
      const mnemonic = mnemonics[0]
      process.env.MNEMONIC = mnemonic.mnemonic
    } else {
      const mnemonic = new Mnemonic({ mnemonic: MNEMONIC })
      await mnemonic.save()
    }
  }

  if (NODE_ENV === 'test') {
    if (MNEMONIC === 'undefined' || MNEMONIC === undefined || MNEMONIC === '') {
      const mnemonic = generateMnemonic(128)
      rewriteEnv('.env', 'MNEMONIC', `"${mnemonic}"`)
      process.env.MNEMONIC = mnemonic
    } else if (isCI) {
      rewriteEnv('.env', 'MNEMONIC', `"${MNEMONIC}"`)
    }
  }

  switch (process.env.PROCESS_TYPE) {
    case 'api':
      require('./api')
      break

    case 'worker':
      require('./worker')
      break

    case 'migrate':
      require('./migrate')
      break

    default:
      throw new Error('Unknown PROCESS_TYPE')
  }
}

start()

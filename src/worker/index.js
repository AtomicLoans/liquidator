const mongoose = require('mongoose')
const Agenda = require('agenda')
const express = require('express')

const agenda = new Agenda({ mongo: mongoose.connection, maxConcurrency: 1000, defaultConcurrency: 1000, defaultLockLifetime: 10000 })

const { getInterval } = require('../utils/intervals')

const { defineLoanJobs } = require('./loan/index')

const { RUN_SINGLE_PROCESS, WORKER_PORT, PORT, NODE_ENV, HEROKU_APP } = process.env

async function start () {
  await agenda.start()

  if (NODE_ENV === 'test') {
    await agenda.now('fund')
  }

  await agenda.every('2 minutes', 'update-market-data')

  await agenda.every(getInterval('CHECK_ALL_RECORDS_INTERVAL'), 'check-loan-statuses-and-update')

  await agenda.every(getInterval('ARBITER_STATUS_INTERVAL'), 'check-liquidator-status')

  await agenda.every(getInterval('SANITIZE_TX_INTERVAL'), 'sanitize-eth-txs')

  if (NODE_ENV === 'test' || (HEROKU_APP !== undefined && HEROKU_APP !== 'undefined')) {
    await agenda.now('notify-arbiter')
  }

  agenda.define('restart', async (job, done) => {
    await start()
    done()
  })

  if (NODE_ENV === 'test') {
    const { fundAgent } = require('../../test/loan/loanCommon')

    agenda.define('fund', async (job, done) => {
      await fundAgent(`http://localhost:${PORT}/api/loan`)
      done()
    })
  }
}

if (!(RUN_SINGLE_PROCESS || (HEROKU_APP !== undefined && HEROKU_APP !== 'undefined'))) {
  const app = express()
  app.get('/ping', (_, res) => res.send('pong'))
  app.listen(WORKER_PORT || PORT)
}

async function stop () {
  await agenda.stop()
  process.exit(0)
}

defineLoanJobs(agenda)

process.on('SIGTERM', stop)
process.on('SIGINT', stop)

start()

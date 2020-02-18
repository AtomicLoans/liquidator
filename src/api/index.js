const Sentry = require('@sentry/node')

const express = require('express')
const helmet = require('helmet')
const compression = require('compression')
const bodyParser = require('body-parser')
const Agenda = require('agenda')
const Agendash = require('agendash')
const path = require('path')
const reactViews = require('express-react-views')
const basicAuth = require('express-basic-auth')

const bugsnag = require('@bugsnag/js')
const bugsnagExpress = require('@bugsnag/plugin-express')

const cors = require('../middlewares/cors')
const httpHelpers = require('../middlewares/httpHelpers')
const handleError = require('../middlewares/handleError')

const { migrate } = require('../migrate/migrate')

const {
  PORT, MONGODB_URI, MONGODB_ARBITER_URI, PARTY, DASH_PASS, BUGSNAG_API, RUN_SINGLE_PROCESS, HEROKU_APP, NODE_ENV
} = process.env

if (RUN_SINGLE_PROCESS || (HEROKU_APP !== undefined && HEROKU_APP !== 'undefined')) {
  require('../worker/index')
}

const bugsnagClient = bugsnag(BUGSNAG_API)

let agenda
if (PARTY !== 'arbiter') {
  agenda = new Agenda({ db: { address: MONGODB_URI } })
} else {
  agenda = new Agenda({ db: { address: MONGODB_ARBITER_URI } })
}

migrate()

const app = express()

bugsnagClient.use(bugsnagExpress)
const middleware = bugsnagClient.getPlugin('express')

app.use(middleware.requestHandler)

let dashPass
if (process.env.NODE_ENV === 'production') {
  app.use(Sentry.Handlers.requestHandler())
  dashPass = DASH_PASS
} else {
  dashPass = 'test'
}

app.use(httpHelpers())
app.use(helmet())
app.use(cors())
app.use(compression())
app.use(bodyParser.json({ limit: '5mb' }))
app.use(bodyParser.urlencoded({ extended: true, limit: '5mb' }))
app.set('etag', false)
app.set('agenda', agenda)

app.use('/dash',
  basicAuth({
    users: {
      admin: dashPass
    },
    challenge: true
  }),
  Agendash(agenda)
)

app.use('/api/swap', require('./routes/swap'))
app.use('/api/loan', require('./routes/loan/index'))

app.set('views', path.join(__dirname, '/views'))
app.set('view engine', 'js')
app.engine('js', reactViews.createEngine())

app.use('/public', express.static(path.join(__dirname, 'public')))

app.get('/', require('./viewRoutes').index)
app.get('/verify', require('./viewRoutes').verify)
app.get('/key', require('./viewRoutes').key)
app.get('/success', require('./viewRoutes').success)

if (NODE_ENV === 'production') {
  app.use(Sentry.Handlers.errorHandler())
}

app.use(handleError())

app.use(middleware.errorHandler)

app.listen(PORT)

const {
  database,
  up
} = require('@mblackmblack/migrate-mongo')

async function migrate () {
  const db = await database.connect()

  const migrated = await up(db)
  migrated.forEach(fileName => console.log('Migrated: ', fileName))
}

module.exports = {
  migrate
}

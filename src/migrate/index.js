const { migrate } = require('./migrate')

async function main () {
  await migrate()

  process.exit()
}

main()

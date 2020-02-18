const { loadVariables } = require('./bin/commons')

loadVariables({ defaultPort: 3001, processType: 'worker' })

require('./src')

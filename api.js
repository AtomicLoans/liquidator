const { loadVariables } = require('./bin/commons')

loadVariables({ defaultPort: 3000, processType: 'api' })

require('./src')

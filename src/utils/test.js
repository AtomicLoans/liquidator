const fs = require('fs')
const path = require('path')

function getEnvValue (key) {
  const env = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf-8')
  const regex = new RegExp(`${key}=("(.*?)"|([0-9a-zA-Z])\\w+)`, 'g')
  const value = env.match(regex)
  return value.toString().replace(`${key}=`, '').replace('"', '').replace('"', '')
}

function updateEnvValue (key) {
  const value = getEnvValue(key)
  process.env[key] = value
  return value
}

module.exports = {
  getEnvValue,
  updateEnvValue
}

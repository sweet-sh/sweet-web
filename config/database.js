const config = require('config')

const dbConfig = config.get('dbConfig')

module.exports = {
  url: `mongodb://${dbConfig.host}:${dbConfig.port}/${dbConfig.defaultauthdb}`
}

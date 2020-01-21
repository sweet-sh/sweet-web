let sgMail

if (process.env.NODE_ENV === 'production') {
  var apiConfig = require('./apis.js')
  sgMail = require('@sendgrid/mail')
  sgMail.setApiKey(apiConfig.sendgrid)
} else {
  sgMail = {
    send: (msg) => {
      console.log('====================')
      console.log('== Sending email:')
      console.log(msg)
      console.log('====================')
      return Promise.resolve()
    }
  }
}

module.exports = sgMail

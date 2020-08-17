const fs = require('fs')
const appRoot = require('app-root-path');
const nodemailer = require('nodemailer')
const nodemailerHbs = require('nodemailer-express-handlebars')
const moment = require('moment-timezone')
const auth = require('../config/auth.js')
const User = require('./models/user')

// create reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
  host: 'smtp.eu.mailgun.org',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: 'postmaster@sweet.sh',
    pass: auth.mailgun
  }
})

const templatedTransporter = nodemailer.createTransport({
  host: 'smtp.eu.mailgun.org',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: 'postmaster@sweet.sh',
    pass: auth.mailgun
  }
})

// verify connection configuration
transporter.verify(function (error, success) {
  if (error) {
    console.log('Email server connection error! ' + error)
  } else {
    console.log('Email server is ready to take our messages! ' + success)
  }
})

const nodemailerHbsOptions = {
  viewEngine: {
    extName: '.handlebars',
    partialsDir: appRoot + '/views/emails',
    defaultLayout: false
  },
  viewPath: appRoot + '/views/emails',
  extName: '.handlebars'
}

templatedTransporter.use('compile', nodemailerHbs(nodemailerHbsOptions))

module.exports.transporter = transporter
module.exports.templatedTransporter = templatedTransporter;

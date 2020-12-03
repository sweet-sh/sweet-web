// Initialization ======================================================================
const express = require('express')
const app = express()
const port = process.env.PORT || 8686
const passport = require('passport')
const flash = require('connect-flash')

const hbs = require('./app/pageRenderer')
app.engine('handlebars', hbs.engine)
app.set('view engine', 'handlebars')

const webpack = require('webpack')
const VueLoaderPlugin = require('vue-loader/lib/plugin')
const compiler = webpack({
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  entry: {
    landingPage: './vue/landingPageEntry.js',
    searchPage: './vue/searchPageEntry.js',
    home: './vue/homeEntry.js',
    tag: './vue/tagEntry.js',
    user: './vue/userEntry.js',
    single: './vue/singleEntry.js',
    community: './vue/communityEntry.js',
    library: './vue/libraryEntry.js',
  },
  output: {
    filename: './public/js/vue/[name].js',
    path: __dirname
  },
  module: {
    rules: [
      {
        test: /\.vue$/,
        loader: 'vue-loader'
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  resolve: {
    alias: {
      vue: process.env.NODE_ENV === 'production' ? 'vue/dist/vue.min.js' : 'vue/dist/vue.js'
    }
  },
  plugins: [new VueLoaderPlugin()]
})

if (process.env.NODE_ENV !== 'production') {
  let lastCompilationHadError = false
  compiler.watch({
    aggregateTimeout: 300,
    ignored: /node_modules/,
    poll: 1000
  }, (err, stats) => {
    if (err) {
      console.error(err)
      lastCompilationHadError = true
    } else if (stats.compilation.errors.length) {
      console.error(...stats.compilation.errors)
      lastCompilationHadError = true
    } else if (lastCompilationHadError) {
      console.log('no webpack compilation errors now 👍')
      lastCompilationHadError = false
    }
  })
} else {
  compiler.run((err, stats) => {
    if (err || stats.compilation.errors.length) {
      console.error('webpack failed to compile!')
      console.error(err, ...stats.compilation.errors)
    }
  })
}

const compression = require('compression')
app.use(compression())

const expressValidator = require('express-validator')
app.use(expressValidator())

const morgan = require('morgan')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const session = require('express-session')

const fileUpload = require('express-fileupload')
app.use(fileUpload())

// Set up our Express application
app.use(cookieParser()) // read cookies (needed for auth)
app.use(bodyParser()) // get information from html forms
const mongoSanitize = require('express-mongo-sanitize') // sanitize information recieved from html forms
app.use(mongoSanitize())

// Static files
app.use(express.static('public'))

// Database Configuration and Global Variable Creation===============================================================
const configDatabase = require('./config/database.js')
const mongoose = require('mongoose')
mongoose.connect(configDatabase.url, { useNewUrlParser: true }) // connect to our database
require('./app/models/user')
require('./app/models/relationship')
require('./app/models/post')
require('./app/models/tag')
require('./app/models/community')
require('./app/models/vote')
require('./app/models/image')

// persist sessions across restarts via their storage in mongodb
const MongoStore = require('connect-mongo')(session)

// set up passport authentication and session storage
require('./config/passport')(passport) // pass passport for configuration
var auth = require('./config/auth.js')
app.use(session({
  secret: auth.secret,
  cookie: {
    maxAge: (30 * 24 * 60 * 60 * 1000)
  }, // 30 days
  rolling: true,
  resave: true,
  saveUninitialized: false,
  store: new MongoStore({
    mongooseConnection: mongoose.connection,
    secret: auth.secret
  })
}))
app.use(passport.initialize())
app.use(passport.session()) // persistent login sessions
app.use(flash()) // use connect-flash for flash messages stored in session
app.use(function (req, res, next) {
  res.locals.sessionFlash = req.session.sessionFlash
  delete req.session.sessionFlash
  next()
})

// CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// set up webpush to send push notifications for the notifier
const webpush = require('web-push')
if (!auth.vapidPrivateKey || !auth.vapidPublicKey) {
  const vapidKeys = webpush.generateVAPIDKeys()
  webpush.setVapidDetails(
    'mailto:support@sweet.sh',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  )
} else {
  webpush.setVapidDetails(
    'mailto:support@sweet.sh',
    auth.vapidPublicKey,
    auth.vapidPrivateKey
  )
}

// kill the process when the sigint code is recieved, generally generated by pressing ctrl-c in the console
app.on('SIGINT', function () {
  db.stop(function (err) {
    process.exit(err ? 1 : 0)
  })
})

// S3 API setup for image uploads and downloads
const AWS = require('aws-sdk')
// Set the region 
AWS.config.update({region: 'eu-west-2'})
s3 = new AWS.S3({apiVersion: '2006-03-01'})
s3Bucket = 'sweet-images'

// utilized by routes code =================================================================================
const path = require('path')
global.appRoot = path.resolve(__dirname)
const fs = require('fs')
const moment = require('moment')
moment.updateLocale('en', {
  relativeTime: {
    future: 'in %s',
    past: '%s',
    s: 'just now',
    ss: '%ds ago',
    m: '1m ago',
    mm: '%dm ago',
    h: '1h ago',
    hh: '%dh ago',
    d: '1d ago',
    dd: '%dd ago',
    M: '1mon ago',
    MM: '%dmon ago',
    y: '1y ago',
    yy: '%dy ago'
  },
  calendar: {
    sameDay: '[today at] h:mm a [UTC]Z',
    lastDay: '[yesterday at] h:mm a [UTC]Z',
    lastWeek: '[last] dddd [at] h:mm a [UTC]Z',
    sameElse: 'MMMM Do YYYY, [at] h:mm a [UTC]Z'
  }
})
const momentLogFormat = '[[]DD/MM HH:mm:ss.SSS[]]'
require('sanitize-html')
require('sharp')
require('nanoid')
require('bcryptjs')
require('autolinker')
require('node-schedule')
require('./config/globals')

const writeMorganToSeparateFile = false // false = write full request log to stdout instead of a separate file

let stream
if (writeMorganToSeparateFile) {
  var morganOutput = fs.openSync('full request log starting ' + moment().format('DD-MM HH[h] MM[m] ss[s]') + '.txt', 'w') // colons in the file path not supported by windows :(
  stream = {
    write: function (input, encoding) {
      fs.writeSync(morganOutput, input, undefined, encoding)
    }
  }
} else {
  stream = process.stdout
}
// log every request to the console w/ timestamp before it can crash the server
app.use(morgan(function (tokens, req, res) { return moment().format(momentLogFormat) + ' ' + req.method.toLowerCase() + ' request for ' + req.url }, { immediate: true, stream: stream }))
// add timestamps to all console logging functions
for (const spicy of ['warn', 'error', 'log']) {
  const vanilla = console[spicy]
  console[spicy] = function () {
    vanilla.call(console, ...[moment().format(momentLogFormat)].concat(Array.from(arguments)))
  }
}

// routes ======================================================================
require('./app/utilityFunctionsMostlyText.js')
require('./app/statisticsTracker.js')(app, mongoose)
require('./app/notifier.js')
require('./app/personalAccountActions.js')(app, passport)
require('./app/inhabitingCommunities.js')(app, passport)
require('./app/viewingSweet.js')(app)
require('./app/postingToSweet.js')(app)

// launch ======================================================================
app.listen(port)

/* var https = require('https');
var httpsOptions = {
    key: fs.readFileSync('../192.168.1.15-key.pem'),
    cert: fs.readFileSync('../192.168.1.15.pem')
};
https.createServer(httpsOptions, app)
.listen(3000, function () {
  console.log('app listening on port 3000! Go to https://localhost:3000/')
}) */

console.log('Server booting on default port: ' + port)

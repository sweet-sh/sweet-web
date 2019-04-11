// Initialization ======================================================================
var express  = require('express');
var handlebars = require('express-handlebars');
var app      = express();
var port     = process.env.PORT || 8686;
var mongoose = require('mongoose');
var passport = require('passport');
var flash    = require('connect-flash');
var helpers = require('handlebars-helpers')();

var expressValidator = require('express-validator');
app.use(expressValidator());

var morgan       = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser   = require('body-parser');
var session      = require('express-session');

var configDatabase = require('./config/database.js');

var moment = require('moment');
var sanitize = require('mongo-sanitize');
const fileUpload = require('express-fileupload');
var shortid = require('shortid');

app.use(fileUpload());

// Configuration ===============================================================
mongoose.connect(configDatabase.url, { useNewUrlParser: true }); // connect to our database

require('./config/passport')(passport); // pass passport for configuration

// Set up our Express application
app.use(morgan('dev')); // log every request to the console
app.use(cookieParser()); // read cookies (needed for auth)
app.use(bodyParser()); // get information from html forms

// View engine (Handlebars)
var hbs = handlebars.create({
  defaultLayout: 'main',
  helpers: {
      plural: function (number, text) {
        var singular = number === 1;
      	// If no text parameter was given, just return a conditional s.
      	if ( typeof text !== 'string' ) return singular ? '' : 's';
      	// Split with regex into group1/group2 or group1(group3)
      	var match = text.match( /^([^()\/]+)(?:\/(.+))?(?:\((\w+)\))?/ );
      	// If no match, just append a conditional s.
      	if ( !match ) return text + ( singular ? '' : 's' );
      	// We have a good match, so fire away
      	return singular && match[1] // Singular case
      		|| match[2] // Plural case: 'bagel/bagels' --> bagels
          || match[1] + ( match[3] || 's' ); // Plural case: 'bagel(s)' or 'bagel' --> bagels
      }
  }
});
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');

// Static files
app.use(express.static('public'));

// Required for passport
var passportAuth = require('./config/auth.js');
app.use(session({
  secret: passportAuth.secret,
  cookie:{ _expires: (12 * 60 * 60 * 1000) }, // 12 hours
  rolling: true,
  resave: true,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session()); // persistent login sessions
app.use(flash()); // use connect-flash for flash messages stored in session
app.use(function(req, res, next){
  res.locals.sessionFlash = req.session.sessionFlash;
  delete req.session.sessionFlash;
  next();
});

app.on('SIGINT', function() {
   db.stop(function(err) {
     process.exit(err ? 1 : 0);
   });
});

// routes ======================================================================
require('./app/notifier.js')
require('./app/communityRoutes.js')(app, passport);
require('./app/routes.js')(app, passport);

// launch ======================================================================
app.listen(port);
console.log('The magic happens on port ' + port);

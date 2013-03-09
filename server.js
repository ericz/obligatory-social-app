var conf = require('./conf.js');

var express = require('express');
var fs = require('fs');
var app =  express.createServer();
var passport = require('passport');

var FacebookStrategy = require('passport-facebook').Strategy;

var mongo = require('mongoskin');
var db = mongo.db('mongo://localhost:27017/connect');

/**
 * User:
 *  username: Self-generated,
 *  facebook: profile,
 *  accessToken: {
 *    facebook: 'xfdfsdf',
 *    twitter: 'werwerw',
 *    ...
 *  }
 */
var User = db.collection('users');


/**
 * Contact:
 *  sources: {
 *    facebook: fb_id,
 *    twitter: tw_id,
 *    ... 
 *  }, <- match by username, name.
 *  name: 'Michelle Bu',
 *  last_contacted: Date,
 *  initiated: true/false (if the user initiated contact).
 *  last_message: 'Hi I got a new cat.',
 *  interests: [] <- if we can find any from likes, etc.
 */
var Contact = db.collection('contacts');

// Initialize main server.
app.configure(function() {
  app.use(express.cookieParser());
  app.use(express.bodyParser());
  app.use(express.session({ secret: 'keyboard puppies' }));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(express.static(__dirname + '/public'));
});

app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

// Passport utils.
passport.serializeUser(function(user, callback) {
  User.find
  callback(null, user.id);
});
passport.deserializeUser(function(id, callback) {
  User.findById(id, callback);
});

// FACEBOOK Strategy for Passport.
passport.use(new FacebookStrategy({
    clientID: conf.FB_APP_ID,
    clientSecret: conf.FB_APP_SECRET,
    profileFields: ['id', 'displayName', 'gender', 'emails'],
    callbackURL: "http://localhost:9000/auth/facebook/callback"
  },
  function(accessToken, refreshToken, profile, done) {
    
    return done(null, profile);
  })
);

app.get('/', function(req, res) {
  res.render('index', { user: req.user });
});

app.get('/login', function(req, res) {
  res.render('login', { user: req.user });
});

// Logged in pages
app.get('/dashboard', ensureAuthenticated, function(req, res){
  res.render('dashboard', { user: req.user });
});

// Auth.
// Permissions I want:
var scope = [
    'friends_likes' // likes
  , 'friends_interests' // interests
  , 'read_stream' // feed, posts
  , 'read_mailbox' // inbox
]

app.get('/auth/facebook',
  passport.authenticate('facebook', { scope: scope }),
  function(req, res) { /* Ignore */ }
);

app.get('/auth/facebook/callback', 
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/');
  }
);

// Logout.
app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

app.listen(9000);

// Ensure auth for pages that require it.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login')
}

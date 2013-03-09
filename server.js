var conf = require('./conf.js');

var express = require('express');
var fs = require('fs');
var app =  express.createServer();
var passport = require('passport');

var FacebookStrategy = require('passport-facebook').Strategy;

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
  callback(user.id);
});
passport.deserializeUser(function(id, callback) {
  User.findById(id, callback);
});

// FACEBOOK Strategy for Passport.
passport.use(new FacebookStrategy({
    clientID: util.FB_APP_ID,
    clientSecret: util.FB_APP_SECRET,
    callbackURL: "/auth/facebook/callback"
  },
  function(accessToken, refreshToken, profile, done) {
    console.log(arguments);
  }
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
  , 'read_stream' // feed
  , 'read_mailbox' // inbox
]

app.get('/auth/facebook',
  passport.authenticate('facebook', { scope: scope }, function(req, res) { /* Ignore */ }
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

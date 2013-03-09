var conf = require('./conf.js');

var express = require('express');
var fs = require('fs');
var app =  express.createServer();
var passport = require('passport');
var bcrypt = require('bcrypt');

var FacebookStrategy = require('passport-facebook').Strategy;
var LocalStrategy = require('passport-local').Strategy;

var mongo = require('mongoskin');
var db = mongo.db('mongo://localhost:27017/connect');

/**
 * User:
 *  username: Self-generated,
 *  hash: password hash,
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
 *  assoc: User.username,
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
  callback(null, user._id);
});
passport.deserializeUser(function(id, callback) {
  User.findById(id, callback);
});

// FACEBOOK Strategy for Passport.
passport.use(new FacebookStrategy({
    clientID: conf.FB_APP_ID,
    clientSecret: conf.FB_APP_SECRET,
    passReqToCallback: true,
    profileFields: ['id', 'displayName', 'gender', 'emails'],
    callbackURL: "http://localhost:9000/auth/facebook/callback"
  },
  function(req, accessToken, refreshToken, profile, done) {
    var user = req.user;
    if (!user) {
      return done(new Error('Not logged in'));
    }

    user.facebook = profile;
    user.facebook.accessToken = accessToken;

    User.findAndModify({ _id: user._id }, {}, user, { new: true }, function(err, user) {
      if (err) {
        return done(new Error('User does not exist'));
      }
      return done(null, user);
    });
  })
);

// Local Strategy.
passport.use(new LocalStrategy(
  function(username, password, done) {
    User.findOne({ username: username }, function(err, user) {
      if (err) {
        return done(err);
      } else if (!user) {
        return done(null, false);
      }
      bcrypt.compare(password, user.hash, function(err, match) {
        if (match) {
          return done(null, user);
        } else {
          return done(new Error('Password does not match'));
        }
      });
    });
  }
));

app.get('/', function(req, res) {
  res.render('index', { user: req.user });
});

app.get('/login', function(req, res) {
  res.render('login', { user: req.user });
});

app.post('/login', function(req, res, next) {
  passport.authenticate('local', function(err, user, info) {
    if (err) { return next(err) }
    if (!user) {
      return res.redirect('/login')
    }
    req.login(user, function(err) {
      if (err) { return next(err); }
      return res.redirect('/dashboard');
    });
  })(req, res, next);
});

// REGISTER
app.post('/register', function(req, res) {
  if (!req.body.username || !req.body.password) {
    res.send({ err: 'Please enter a username and password.' });
    return;
  }
  User.findOne({ username: req.body.username.toLowerCase() }, function(err, user) {
    // TODO: fix res.sends
    if (!user) {
      bcrypt.genSalt(10, function(err, salt) {
        bcrypt.hash(req.body.password, salt, function(err, hash) {
          // Save new user to database.
          User.insert({
            username: req.body.username.toLowerCase(),
            hash: hash,
          }, {}, function(err, result) {
            if (err) {
              res.send({ err: 'Username is taken.' });
            } else {
              req.login(result[0], function(err) {
                if (err) { console.log(err); }
                res.redirect('/dashboard');
              });
            }
          });
        });
      });
    } else {
      res.send({ err: 'Username is taken.' });
    }
  });
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
    // TODO: crazy fb graph api stuff.
    res.redirect('/dashboard');
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

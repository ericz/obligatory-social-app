var conf = require('./conf.js');

var express = require('express');
var fs = require('fs');
var app =  express.createServer();
var passport = require('passport');
var bcrypt = require('bcrypt');
var restler = require('restler');

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
    callbackURL: "http://contacts.michellebu.com/auth/facebook/callback"
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
  if (req.user) {
    res.redirect('/dashboard');
  } else {
    res.redirect('/login');
  }
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
            stime: 14,
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
app.get('/dashboard', ensureAuthenticated, function(req, res) {
  Contact.find({ assoc: req.user.username }).toArray(function(err, contacts) {
    res.render('dashboard', { user: req.user, contacts: contacts, app_id: conf.FB_APP_ID });
  });
});

var APIs = {
  facebook: function(url, req, res, redirect) {
    var serv = req.user[req.params.service];
    restler.get(url).on('complete', function(graphres) {
      graphres = JSON.parse(graphres);
      if (graphres.inbox && graphres.inbox.data && graphres.inbox.data.length > 0) {
        // TODO: handle this.
        var next = graphres.inbox.paging ? graphres.inbox.paging.next : '';
        //APIs.facebook(next, req, res, false);
        var inbox = graphres.inbox.data;
        var userContacts = [];
        var total = inbox.length;
        for (var i = 0, ii = inbox.length; i < ii; i += 1) {
          var exchange = inbox[i];
          var contactInfo = exchange.to.data;
          // TODO: account for multiple people chats.
          if (contactInfo.length !== 2) {
            total -= 1;
            continue;
          }
          var contact = {
            name: contactInfo[0].id === serv.id ? contactInfo[1].name : contactInfo[0].name,
            facebook_id: contactInfo[0].id === serv.id ? contactInfo[1].id : contactInfo[0].id
          }
          if (exchange.comments) {
            var lastMessage = exchange.comments.data[exchange.comments.data.length - 1];
            contact.last_contacted = new Date(lastMessage.created_time);
            contact.last_message = lastMessage.message;
            /*if (lastMessage.message) {
              var poslist = new pos.Tagger().tag(new pos.Lexer().lex(lastMessage.message));
              console.log(poslist);
              filteredPos = [];
              for (var p = 0, pp = poslist.length; p < pp && p <= 5; p += 1) {
                console.log(p, poslist.length, pp);
                if (poslist[p][1] === 'NN' || poslist[p][1] === 'NNS') {
                  filteredPos.push(poslist);
                }
              }
              contact.keywords = filteredPos;
            }*/
            contact.initiated = exchange.comments.data[exchange.comments.data.length - 1].from.id === serv.id;
            contact.method = 'facebook';
            contact.assoc = req.user.username;

            (function(contact, index) {
              Contact.find({ assoc: contact.assoc, name: contact.name }).toArray(function(err, contacts) {
                var dbContact = contact;
                if (err) {
                  console.log(err);
                  total -= 1;
                } else if (!!contacts) {
                  for (var j = 0, jj = contacts.length; j < jj; j += 1) {
                    _contact = contacts[j];
                    if (_contact.facebook_id === contact.facebook_id) {
                      dbContact = _contact;
                      break;
                    } else if (!_contact.facebook_id) {
                      dbContact = _contact;
                    }
                  }
                }
                if (dbContact.last_contacted < contact.last_contacted) {
                  // TODO: make this extend or something so less messy code.
                  dbContact.last_contacted = contact.last_contacted;
                  dbContact.last_message = contact.last_message || dbContact.last_message;
                  dbContact.initiated = contact.initiated;
                  dbContact.facebook_id = contact.facebook_id;
                  dbContact.method = contact.method;
                }

                Contact.update({ _id: dbContact._id }, dbContact, { upsert: true }, function(err) {
                  userContacts.push(dbContact);
                  if (redirect && index === total - 1) {
                    //if (next) {
                     // APIs.facebook(next, req, res);
                      res.redirect('/dashboard');
                    //}
                  }
                });
              });
            })(contact, i);
          } else if (i === total - 1) {
            total -= 1;
          }
        }
      }
    });
  },
  twitter: function() {}
}

app.get('/dashboard/:service', ensureAuthenticated, function(req, res) {
  var serv = req.user[req.params.service];
  if (req.params.service === 'facebook') {
    var url = 'https://graph.facebook.com/' + serv.id + '?fields=inbox.limit(500)&access_token=' + serv.accessToken;
    APIs.facebook(url, req, res, true);
  }
});

// Starring a contact.
app.post('/star', ensureAuthenticated, function(req, res) {
  var contact = req.body.contact;
  Contact.updateById(contact, { $set: { starred: true } }, function(err) {
    if (err) {
      console.log(err);
    }
  });
});
app.post('/unstar', ensureAuthenticated, function(req, res) {
  var contact = req.body.contact;
  Contact.updateById(contact, { $set: { starred: false } }, function(err) {
    if (err) {
      console.log(err);
    }
  });
});

// Posting a new star time.
app.post('/stime', ensureAuthenticated, function(req, res) {
  var stime = req.body.stime;
  User.updateById(req.user._id, { $set: { stime: stime } }, function(err) {
    if (err) {
      console.log(err);
    }
  });
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
    res.redirect('/dashboard/facebook');
  }
);

// Logout.
app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

app.listen(8010);

// Ensure auth for pages that require it.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login')
}

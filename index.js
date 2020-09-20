const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const http = require('http');
const https = require('https');
const bodyParser = require('body-parser');
const session = require('express-session');
const mongo = require('mongoose');
const morgan = require('morgan');
const cron = require("node-cron");
const bcrypt = require('bcrypt');
const LocalStrategy = require('passport-local').Strategy;
const sgMail = require('@sendgrid/mail');

mongo.connect('mongodb+srv://ip333:1234567890@hackmit2020.bfaa8.mongodb.net/FitBeatDepresso?retryWrites=true&w=majority', {useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false });

module.exports = {
  mongoose: mongo,
};
//
const {User} = require('./models/Users.js');

const passport = require("passport");

const FitbitStrategy = require('passport-fitbit-oauth2').FitbitOAuth2Strategy

passport.serializeUser((user, cb) => {
    console.log("SERIALIZING USER")
    console.log(JSON.stringify(user))
  cb(null, user);
});

passport.deserializeUser((user, cb) => {
    console.log("DESIRIALIZING USER")
    console.log(JSON.stringify(user))
  cb(null, user);
});

passport.use(new FitbitStrategy({
      clientID: '22BRYF',
      clientSecret: '0142a3749cab072537bb965dcec6c174',
      callbackURL: "http://localhost:5000/auth/fitbit/callback"
    },
    async function(accessToken, refreshToken, profile, done) {
      console.log(profile)
      await User.create({fullName: profile.fullName, accessToken, refreshToken});
      done(null, profile)
    }
));

passport.use(
    new LocalStrategy({
          usernameField: 'email',
          passwordField: 'password',
        },
        async (email, password, done) => {
          let user = null;
          user = await User.findOne({email});
          console.log("HERE INSIDDDDE ::: ::: :: ::");
          if(!user){
            done({type: 'email', message: 'No such user found'}, false);
            return;
          }
          if(password == user.password){//bcrypt.compareSync(password, user.password)){
            console.log("LOGGED IN")
            done(null, {id: user.id, email: user.email, fullName: user.fullName})

          } else{
              console.log("ERRRRRRORROROROROROROR")
            done({type: 'password', message: 'Password or Email is incorrect'}, false)
          }
        }));

passport.use('local.signup',
    new LocalStrategy({
          usernameField: 'email',
          passwordField: 'password',
          passReqToCallback: true,
        },
        async (req, email, password, done) => {
        console.log("HERE INSIDDDDE ------ ----- SIGNUP", email, password);
          let user = null;
          user = await User.findOne({email});
          if(user){
            done({type: 'email', message:'Email already exists'}, false);
            return;
          }
          const {fullName} = req.body;

          // const salt = await bcrypt.genSalt(10);
          // const encryptedPassword = await bcrypt.hash(password, salt);

          user = new User({
            email,
            password,//: encryptedPassword,
            fullName,
          })

          await user.save();

          console.log("DONNE")
          done(null, {id: user.id, email: user.email, fullName: user.fullName});

        }));


const index = express();

index.use(express.json());
index.use(express.urlencoded({extended: true}));

index.use(session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: true
}))

index.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", process.env.NODE_ENV === "production" ? "https://fit-beat-depresso.herokuapp.com" : 'http://localhost:3000');
    res.header("Access-Control-Allow-Credentials", true);
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header("Access-Control-Allow-Headers", 'Origin,X-Requested-With,Content-Type,Accept,content-type');
    next();
});

// index.use(cors);
// index.use(bodyParser.json());
index.use(morgan('combined'))
index.use(passport.initialize());
index.use(passport.session());

//routes go here with index.{method}

index.get('/testing', (req, res) => {
  res.send("HELLO");
})

index.get('/auth/fitbit', passport.authenticate('fitbit', {scope: ['activity', 'heartrate', 'sleep', 'profile', 'settings']}));

index.get('/auth/fitbit/callback', passport.authenticate('fitbit', {
  successRedirect: '/',
  failureRedirect: '/',
}))

index.post('/auth/local/login',
    passport.authenticate('local'),
    function(req, res) {
        console.log(req.user)
        req.login(req.user, function(err) {
            if (err) { return next(err); }
            console.log("LOGGGED INNNNNNNN")
            return;
        });
      res.json({
        user: req.user,
      })
    });

index.post('/auth/local/signup',
    passport.authenticate('local.signup'),
    function(req, res) {
      res.json({
          user: req.user,
      })
    });

index.get('/getConnections', async (req, res) => {
    console.log('USER', req.user);
    console.log('isAuthenticated', req.isAuthenticated());
  if(req.user){
      const user = await User.findById(req.user.id).populate('connections')
      console.log('user', user);
      console.log('Connections', user.connections);
    res.json({
      connections: user.connections || [],
    })
  }
  else{
      res.status(401)
      res.json({
          message: 'Error logging in'
      })
  }
})

index.post('/updateMood', async (req, res) => {
    const {id, score} = req.body;
    const user = await User.findByIdAndUpdate(id, {moodScore: score})
    res.json({
        message: "Success",
    })
})

index.get('/getOwnProfile', async (req, res) => {
    const user = await User.findById(req.user.id)
    res.json({
        user,
    })
})

index.post('/addConnection', async (req, res) => {
    console.log("USER", req.user);
    console.log("isAuthenticated", req.isAuthenticated())
  if(req.user){
    const {email} = req.body;
    var invitee = await User.findOneAndUpdate({email}, {$push: {connections: req.user.id}});
    console.log(invitee)
    await User.findOneAndUpdate({_id: req.user.id}, {$push: {connections: invitee.id}});
    res.json({
        message: "Success"
    })
  }
  else{
    res.status(401)
      res.json({
          message: 'Error logging in'
      })
  }
})

index.get('/testCronJob', async (req, res) => {
    const users = await User.find({});
    for(var i = 0; i < users.length; i++){
        // call machine leanring api
        let score = 5
        await User.findByIdAndUpdate(users[i].id, {moodScore: score})
        if(score < 5 && (users[i].connections || []).length > 0){
            sgMail.setApiKey('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');
            const msg = {
                to: users[i].connections.map(item => item.email),
                from: 'fitbeatdepresso@gmail.com',
                subject: 'Sending with Twilio SendGrid is Fun',
                text: 'and easy to do anywhere, even with Node.js',
                html: '<strong>and easy to do anywhere, even with Node.js</strong>',
            };
            sgMail.send(msg);
        }

    }
})

cron.schedule("0 8 * * *", async function() {
    console.log("running at 8 am");
    const users = await User.find({});
    for(var i = 0; i < users.length; i++){
        // call machine leanring api
        let score = 5
        await User.findByIdAndUpdate(users[i].id, {moodScore: score})
        if(score < 5 && (users[i].connections || []).length > 0){
            sgMail.setApiKey('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');
            const msg = {
                to: users[i].connections.map(item => item.email),
                from: 'fitbeatdepresso@gmail.com',
                subject: 'Sending with Twilio SendGrid is Fun',
                text: 'and easy to do anywhere, even with Node.js',
                html: '<strong>and easy to do anywhere, even with Node.js</strong>',
            };
            sgMail.send(msg);
        }

    }
});


// index.use(express.static(path.join(__dirname, '../client/build')));
//
// index.get('*', function(req, res) {
//   res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
// });

// if (process.env.NODE_ENV === "production") {
//
// }
//
// if (process.env.NODE_ENV === "production") {
//     const privateKey = fs.readFileSync('/etc/letsencrypt/live/learnpassportjs.com/privkey.pem', 'utf8');
//     const certificate = fs.readFileSync('/etc/letsencrypt/live/learnpassportjs.com/cert.pem', 'utf8');
//     const ca = fs.readFileSync('/etc/letsencrypt/live/learnpassportjs.com/chain.pem', 'utf8');
//     const credentials = {
//         key: privateKey,
//         cert: certificate,
//         ca: ca
//     };
//
//     https.createServer(credentials, index).listen(443, () => {
//         console.log('HTTPS Server running on port 443');
//     });
//     http.createServer(function (req, res) {
//         res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
//         res.end();
//     }).listen(80);
// } else if (process.env.NODE_ENV === "development") {
//     console.log("PROCESSING...");
// }
const port = process.env.PORT || 5000;
index.listen(port, () => {
  console.log("PORT 5000")
});

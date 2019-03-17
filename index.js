// npm modules
const path = require('path');
const express = require('express');
const ejs = require('ejs');
const uuid = require('uuid/v4');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const bodyParser = require('body-parser');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt-nodejs');
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PRIVACTIC_SSL
})

// configure passport.js to use the local strategy
passport.use(new LocalStrategy(
  { usernameField: 'email' },
  async (email, password, done) => {
    try {
      const client = await pool.connect()
      const result = await client.query(`SELECT * FROM users WHERE email = '${email}'`);
      const results = (result) ? result.rows : null;
      const user = (results[0]) ? results[0] : null;
      if (!user) {
        return done(null, false, { message: 'Invalid credentials.\n' });
      }
      if (!bcrypt.compareSync(password, user.password)) {
        return done(null, false, { message: 'Invalid credentials.\n' });
      }
      return done(null, user);
      client.release();
    } catch (err) {
      done(err);
    }
  }
));

// tell passport how to serialize the user
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const client = await pool.connect()
    const result = await client.query(`SELECT * FROM users WHERE id = '${id}'`);
    const user = (result) ? result.rows[0] : null;
    return done(null, user);
    client.release();
  } catch (err) {
    done(err, false);
  }
});

// create the server
const app = express()
  .use(express.static(path.join(__dirname, 'public')))
  .set('views', path.join(__dirname, 'views'))
  .set('view engine', 'ejs');

// add & configure middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(session({
  genid: (req) => {
    return uuid() // use UUIDs for session IDs
  },
  store: new FileStore(),
  secret: 'monitor dog',
  resave: false,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

// create the homepage route at '/'
app.get('/', (req, res) => {
  res.render('index');
});

app.get('/db', async (req, res) => {
  try {
    const client = await pool.connect()
    const result = await client.query('SELECT * FROM users');
    const results = { 'results': (result) ? result.rows : null};
    res.json( results );
    client.release();
  } catch (err) {
    console.error(err);
    res.send("Error " + err);
  }
});

app.get('/signup', (req, res) => {
  res.render('signup');
});

app.post('/signup', async (req, res) => {
  try {
    const client = await pool.connect();
    const hash = bcrypt.hashSync(req.body.password);
    const result = await client.query(`INSERT INTO users (username, email, password) VALUES ('${req.body.username}', '${req.body.email}', '${hash}')`)
    res.redirect('/login');
    client.release();
  } catch (err) {
    console.err(err);
    res.send("Error " + err);
  }
});

// create the login get and post routes
app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if(info) {return res.send(info.message)}
    if (err) { return next(err); }
    if (!user) { return res.redirect('/login'); }
    req.login(user, (err) => {
      if (err) { return next(err); }
      return res.redirect('/app');
    })
  })(req, res, next);
});

app.get('/app', (req, res) => {
  if(req.isAuthenticated()) {
    res.render('app');
  } else {
    res.redirect('/')
  }
});

// tell the server what port to listen on
app.listen(3000, () => {
  console.log('Listening on localhost:3000');
});

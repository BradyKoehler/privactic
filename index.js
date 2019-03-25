// npm modules
var fs = require('fs');
var gfs = require('graceful-fs');
gfs.gracefulify(fs);

const path = require('path');
const express = require('express');
var socketIO = require('socket.io');
var morgan = require('morgan');
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
});
const PORT = process.env.PORT || 3000;

// configure passport.js to use the local strategy
passport.use(new LocalStrategy(
  { usernameField: 'email' },
  async (email, password, done) => {
    console.log("passport->async");
    try {
      console.log("passport->async->try");
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
      console.log("passport->async->catch");
      console.log(err);
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
    client.release();
    return done(null, user);
  } catch (err) {
    done(err, false);
  }
});

// create the server
const app = express()
  .use(morgan('dev'))
  .use(express.static(path.join(__dirname, 'public')))
  .set('views', path.join(__dirname, 'views'))
  .set('view engine', 'ejs');

// add & configure middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
const sessionMiddleware = session({
  genid: (req) => {
    return uuid() // use UUIDs for session IDs
  },
  store: new FileStore(),
  secret: 'monitor dog', // TODO replace with env variable
  resave: false,
  saveUninitialized: true
});
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

// create the homepage route at '/'
app.get('/', (req, res) => {
  res.render('index');
});

app.get('/bootstrap-css', (req, res) => {
  res.sendFile(path.join(__dirname + '/node_modules/bootstrap/dist/css/bootstrap.min.css'));
});

app.get('/jquery', (req, res) => {
  res.sendFile(path.join(__dirname + '/node_modules/jquery/dist/jquery.min.js'));
});

app.get('/popper', (req, res) => {
  res.sendFile(path.join(__dirname + '/node_modules/popper.js/dist/popper.min.js'));
});

app.get('/popper.min.js.map', (req, res) => {
  res.sendFile(path.join(__dirname + '/node_modules/popper.js/dist/popper.min.js.map'));
});

app.get('/bootstrap-js', (req, res) => {
  res.sendFile(path.join(__dirname + '/node_modules/bootstrap/dist/js/bootstrap.min.js'));
});

app.get('/bootstrap.min.js.map', (req, res) => {
  res.sendFile(path.join(__dirname + '/node_modules/bootstrap/dist/js/bootstrap.min.js.map'));
});

app.get('/socket.io.js', (req, res) => {
  res.sendFile(path.join(__dirname + '/node_modules/socket.io-client/dist/socket.io.js'));
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
    console.error(err);
    res.send("Error " + err);
  }
});

// create the login get and post routes
app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (info)  { return res.send(info.message); }
    if (err)   { return next(err); }
    if (!user) { return res.redirect('/login'); }

    req.login(user, (err) => {
      if (err) { return next(err); }
      return res.redirect('/app');
    });
  })(req, res, next);
});

app.get('/app', (req, res) => {
  if(req.isAuthenticated()) {
    res.render('app');
  } else {
    res.redirect('/')
  }
});

app.get('/users', async (req, res) => {
  try {
    const client = await pool.connect()
    const result = await client.query(`SELECT id, username FROM users WHERE NOT id = ${req.user.id}`);
    const results = (result) ? result.rows : null;
    res.json(results);
    client.release();
  } catch (err) {
    console.error(err);
    res.send("Error " + err);
  }
});

app.post('/conversations', async (req, res) => {
  try {
    const client = await pool.connect()
    const result = await client.query(`INSERT INTO conversations (first_id, second_id) VALUES (${req.user.id}, ${req.body.id}) RETURNING *`);
    const conversation = (result) ? result.rows[0] : null;
    const result2 = await client.query(`SELECT c.id AS conversation_id, u.username FROM conversations c JOIN users u ON u.id = c.second_id WHERE c.id = ${conversation.id} LIMIT 1`);
    const results = (result2) ? result2.rows[0] : null;
    res.json(results);
    client.release();
  } catch (err) {
    console.error(err);
    res.send("Error " + err);
  }
});

app.get('/conversations', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`SELECT c.id AS conversation_id, u.username FROM conversations c INNER JOIN users u ON (u.id = c.first_id AND NOT u.id = ${req.user.id}) OR (u.id = c.second_id AND NOT u.id = ${req.user.id});`);
    const results = (result) ? result.rows : null;
    res.json(results);
    client.release();
  } catch (err) {
    console.error(err);
    res.send("Error " + err);
  }
});

app.get('/conversation/:id', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`SELECT id, user_id, content, CASE WHEN user_id = ${req.user.id} THEN TRUE ELSE FALSE END AS me FROM messages WHERE conversation_id = ${req.params.id};`);
    const messages = (result) ? result.rows : null;
    res.json(messages);
    client.release();
  } catch (err) {
    console.error(err);
    res.send("Error " + err);
  }
});

app.post('/messages', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`INSERT INTO messages (conversation_id, user_id, content) VALUES (${req.body.conversation_id}, ${req.user.id}, '${req.body.content}') RETURNING *`);
    const message = (result) ? result.rows[0] : null;
    res.json(message);
    client.release();
    const id_res = await client.query(`SELECT socket_id FROM users WHERE id = (
      SELECT
      CASE WHEN first_id = ${req.user.id} THEN second_id ELSE first_id END as id
      FROM conversations WHERE id = ${req.body.conversation_id} LIMIT 1
    ) LIMIT 1`);
    const socket_id = (id_res) ? id_res.rows[0].socket_id : null;
    io.to(`${socket_id}`).emit("message", message);
  } catch (err) {
    console.error(err);
    res.send("Error " + err);
  }
});

// tell the server what port to listen on
const server = app.listen(PORT, () => {
  console.log(`Listening on ${ PORT }`);
});

/* SOCKET>.IO */

var io = socketIO(server)
  .use(function(socket, next) {
    // Wrap the express middleware
    sessionMiddleware(socket.request, {}, next);
  })
  .on("connection", async function(socket){
    // var userId = socket.request.session.passport.user;
    // console.log("Your User ID is", userId);
    // console.log(socket.request.sessionID);
    // console.log(socket.id);
    try {
      const client = await pool.connect();
      const result = await client.query(`UPDATE users SET socket_id = '${socket.id}' WHERE id = ${socket.request.session.passport.user}`);
    } catch (err) {
      console.error(err);
    }

    socket.on('disconnect', async function () {
      try {
        const client = await pool.connect();
        const result = await client.query(`UPDATE users SET socket_id = '' WHERE id = ${socket.request.session.passport.user}`);
      } catch (err) {
        console.error(err);
      }
    });
  });

// io.on('connection', (socket) => {
//   console.log('Client connected');
//   socket.on('disconnect', () => console.log('Client disconnected'));
// });

// setInterval(() => io.emit('time', new Date().toTimeString()), 1000);

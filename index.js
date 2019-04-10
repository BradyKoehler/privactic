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
      client.release();
      if (!user) {
        return done(null, false, { message: 'Invalid credentials.\n' });
      }
      if (!bcrypt.compareSync(password, user.password)) {
        return done(null, false, { message: 'Invalid credentials.\n' });
      }
      return done(null, user);
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
  secret: process.env.PRIVACTIC_SESSION_SECRET,
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

app.get('/kbpgp', (req, res) => {
  res.sendFile(path.join(__dirname + '/public/scripts/kbpgp-2.0.8-min.js'));
});

app.get('/db', async (req, res) => {
  try {
    const client = await pool.connect()
    const result = await client.query('SELECT * FROM users');
    const results = { 'results': (result) ? result.rows : null};
    client.release();
    res.json( results );
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
    const result = await client.query(`INSERT INTO users (username, email, password) VALUES ('${req.body.username}', '${req.body.email}', '${hash}') RETURNING *`);
    // console.log(result);
    const user_id = result.rows[0].id;
    const key_res = await client.query(`INSERT INTO keys (user_id, public, private) VALUES(${user_id}, '${req.body.public}', '${req.body.private}')`);
    // console.log(key_res);
    client.release();
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    res.send("Error " + err);
  }
});

app.get('/check/username', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`SELECT COUNT(*) FROM users WHERE username = '${req.query.username}'`);
    client.release();
    res.json({ taken: result.rows[0].count != 0 });
  } catch (err) {
    console.error(err);
    res.send("Error " + err);
  }
});

app.get('/check/email', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`SELECT COUNT(*) FROM users WHERE email = '${req.query.email}'`);
    client.release();
    res.json({ taken: result.rows[0].count != 0 });
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
    console.log(req.user.id);
    res.render('app', { SOCKET_URL: process.env.PRIVACTIC_SOCKET_IO_URL });
  } else {
    res.redirect('/')
  }
});

app.get('/users', async (req, res) => {
  try {
    const client = await pool.connect()
    const result = await client.query(`SELECT id, username FROM users WHERE NOT id = ${req.user.id}`);
    const results = (result) ? result.rows : null;
    client.release();
    res.json(results);
  } catch (err) {
    console.error(err);
    res.send("Error " + err);
  }
});

app.get('/keys', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`SELECT public, private FROM keys WHERE user_id = ${req.user.id}`);
    const keys = result.rows[0];
    client.release();
    res.json(keys);
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
    client.release();
    res.json(results);
  } catch (err) {
    console.error(err);
    res.send("Error " + err);
  }
});

app.get('/conversations', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT
        c.id as conversation_id,
        u1.username,
        k.public
      FROM users u
      INNER JOIN conversations c
        ON u.id = c.first_id OR u.id = c.second_id
      INNER JOIN users u1
        ON (u1.id = c.first_id OR u1.id = c.second_id) AND NOT u1.id = u.id
      INNER JOIN keys k
        ON k.user_id = u1.id
      WHERE u.id = ${req.user.id}
    `);
    const results = (result) ? result.rows : null;
    client.release();
    res.json(results);
  } catch (err) {
    console.error(err);
    res.send("Error " + err);
  }
});

app.get('/conversation/:id', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT
        id,
        user_id,
        CASE WHEN user_id = ${req.user.id} THEN TRUE ELSE FALSE END AS me,
        CASE WHEN user_id = ${req.user.id} THEN sender_data ELSE recipient_data END AS content
      FROM messages WHERE conversation_id = ${req.params.id};`);
    const messages = (result) ? result.rows : null;
    client.release();
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.send("Error " + err);
  }
});

app.post('/messages', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      INSERT INTO messages (conversation_id, user_id, sender_data, recipient_data)
      VALUES (${req.body.conversation_id}, ${req.user.id}, '${req.body.sender}', '${req.body.recipient}')
      RETURNING
        id, user_id, conversation_id,
        recipient_data as content,
        sender_data;
      `);
    const message = (result) ? result.rows[0] : null;
    const id_res = await client.query(`SELECT socket_id FROM users WHERE id = (
      SELECT
      CASE WHEN first_id = ${req.user.id} THEN second_id ELSE first_id END as id
      FROM conversations WHERE id = ${req.body.conversation_id} LIMIT 1
    ) LIMIT 1`);
    const socket_id = (id_res) ? id_res.rows[0].socket_id : null;
    client.release();
    io.to(`${socket_id}`).emit("message", message);
    res.json({
      id: message.id,
      user_id: message.user_id,
      conversation_id: message.conversation_id,
      content: message.sender_data
    });
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

var io = socketIO(server);

io.use(function(socket, next) { sessionMiddleware(socket.request, {}, next) });

io.on("connection", async function(socket){
  var user_id = socket.request.session.passport.user;
  console.log("Your User ID is", user_id);
  try {
    const client = await pool.connect();
    const result = await client.query(`UPDATE users SET socket_id = '${socket.id}' WHERE id = ${user_id}`);
    client.release();
  } catch (err) {
    console.error(err);
  }

  socket.on('disconnect', async function () {
    try {
      const client = await pool.connect();
      const result = await client.query(`UPDATE users SET socket_id = '' WHERE id = ${user_id}`);
      client.release();
    } catch (err) {
      console.error(err);
    }
  });
});

const bcrypt = require('bcrypt');
const db = require('./database');

function isAuthenticated(req, res, next) {
  if (req.session.isAuthenticated) {
    return next();
  }
  
  req.session.returnTo = req.originalUrl;
  req.flash('error', 'Debes iniciar sesión para acceder a esta página');
  res.redirect('/login');
}

function registerUser(username, email, password, callback) {
  db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, email], (err, user) => {
    if (err) {
      return callback(err);
    }
    
    if (user) {
      return callback(new Error('El nombre de usuario o email ya está registrado'));
    }
    
    bcrypt.hash(password, 10, (err, hash) => {
      if (err) {
        return callback(err);
      }
      
      db.run(
        'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
        [username, email, hash],
        function(err) {
          if (err) {
            return callback(err);
          }
          callback(null, { id: this.lastID, username, email });
        }
      );
    });
  });
}

function authenticateUser(username, password, callback) {
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      return callback(err);
    }
    
    if (!user) {
      return callback(null, false, { message: 'Nombre de usuario incorrecto' });
    }
    
    bcrypt.compare(password, user.password, (err, result) => {
      if (err) {
        return callback(err);
      }
      
      if (!result) {
        return callback(null, false, { message: 'Contraseña incorrecta' });
      }
      
      return callback(null, { id: user.id, username: user.username, email: user.email });
    });
  });
}

module.exports = {
  isAuthenticated,
  registerUser,
  authenticateUser
};
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, 'cdn.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al conectar con la base de datos:', err.message);
  } else {
    console.log('Conexión establecida con la base de datos SQLite');
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      filename TEXT NOT NULL,
      type TEXT NOT NULL,
      price TEXT DEFAULT 'free',
      description TEXT,
      version TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_key TEXT UNIQUE NOT NULL,
      active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    const validLicenses = ['EXNET-PIZZA-2024-001', 'EXNET-PIZZA-2024-002'];
    
    validLicenses.forEach(license => {
      db.run('INSERT OR IGNORE INTO licenses (license_key) VALUES (?)', [license]);
    });

    bcrypt.hash('admin123', 10, (err, hash) => {
      if (err) {
        console.error('Error al generar hash de contraseña:', err);
        return;
      }
      
      db.run(
        'INSERT OR IGNORE INTO users (username, email, password) VALUES (?, ?, ?)',
        ['admin', 'admin@example.com', hash],
        function(err) {
          if (err) {
            console.error('Error al crear usuario admin:', err.message);
          } else if (this.changes > 0) {
            console.log('Usuario admin creado correctamente');
          }
        }
      );
    });
  });
}

module.exports = db;
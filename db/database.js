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
      install_command TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_key TEXT UNIQUE NOT NULL,
      active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS module_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE,
      install_command TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS base_source (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      description TEXT,
      version TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    db.all("PRAGMA table_info(modules)", (err, rows) => {
      if (err) {
        console.error('Error al verificar estructura de tabla:', err);
        return;
      }
      
      const hasInstallCommand = rows.some(row => row.name === 'install_command');
      
      if (!hasInstallCommand) {
        console.log('Añadiendo columna install_command a la tabla modules...');
        db.run('ALTER TABLE modules ADD COLUMN install_command TEXT');
      }
    });

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

  db.run(`CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    platform TEXT NOT NULL,
    version TEXT NOT NULL,
    filename TEXT NOT NULL,
    changelog TEXT,
    release_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Crear índice para búsquedas más rápidas por plataforma
  db.run(`CREATE INDEX IF NOT EXISTS idx_applications_platform ON applications(platform)`);
}

module.exports = db;
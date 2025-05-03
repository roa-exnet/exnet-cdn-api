const express = require('express');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const cors = require('cors');
const fs = require('fs').promises;

const webRoutes = require('./routes/web'); 
const apiRoutes = require('./routes/api');    
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3344;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/css', express.static(path.join(__dirname, 'Assets/css')));
app.use('/js', express.static(path.join(__dirname, 'Assets/js')));

app.use(session({
  secret: 'cdn-admin-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(flash());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

async function createDirectories() {
  const directories = [
    path.join(__dirname, 'public', 'uploads'),
    path.join(__dirname, 'public', 'moduloStreaming'),
    path.join(__dirname, 'public', 'base_source'),
    path.join(__dirname, 'public', 'applications')
  ];

  for (const dir of directories) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (err) {
      console.error(`Error al crear directorio ${dir}:`, err);
    }
  }
}

app.use('/', webRoutes);      
app.use('/api', apiRoutes);   

createDirectories().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
  });
});
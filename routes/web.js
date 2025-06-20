const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const db = require('../db/database');
const { isAuthenticated, registerUser, authenticateUser } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const moduleType = req.body.type || 'default';
    const uploadPath = path.join(__dirname, 'public', moduleType);
    fs.mkdir(uploadPath, { recursive: true })
      .then(() => cb(null, uploadPath))
      .catch(err => cb(err));
  },
  filename: function(req, file, cb) {
    const extension = path.extname(file.originalname);
    const basename = path.basename(file.originalname, extension);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const newName = `${basename}-${uniqueSuffix}${extension}`;
    cb(null, newName);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function(req, file, cb) {
    if (path.extname(file.originalname) !== '.zip') {
      return cb(new Error('Solo se permiten archivos ZIP'));
    }
    cb(null, true);
  },
  limits: { fileSize: 50 * 1024 * 1024 }
});

const applicationStorage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadPath = path.join(__dirname, 'public', 'applications');
    fs.mkdir(uploadPath, { recursive: true })
      .then(() => cb(null, uploadPath))
      .catch(err => cb(err));
  },
  filename: function(req, file, cb) {
    const extension = path.extname(file.originalname);
    const basename = path.basename(file.originalname, extension);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const newName = `${basename}-${uniqueSuffix}${extension}`;
    cb(null, newName);
  }
});

const applicationUpload = multer({ 
  storage: applicationStorage,
  fileFilter: function(req, file, cb) {
    const allowedExtensions = ['.exe', '.dmg', '.deb', '.AppImage', '.apk', '.zip', '.tar.gz'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (!allowedExtensions.includes(ext)) {
      return cb(new Error('Tipo de archivo no permitido'));
    }
    cb(null, true);
  },
  limits: { fileSize: 500 * 1024 * 1024 } 
});

const baseStorage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadPath = path.join(__dirname, 'public', 'base_source');
    fs.mkdir(uploadPath, { recursive: true })
      .then(() => cb(null, uploadPath))
      .catch(err => cb(err));
  },
  filename: function(req, file, cb) {
    cb(null, file.originalname);
  }
});

const baseUpload = multer({ 
  storage: baseStorage,
  fileFilter: function(req, file, cb) {
    if (path.extname(file.originalname) !== '.zip') {
      return cb(new Error('Solo se permiten archivos ZIP'));
    }
    cb(null, true);
  },
  limits: { fileSize: 500 * 1024 * 1024 }
});

function groupModulesByName(modules) {
  const groupedModules = {};
  const result = [];

  modules.forEach(module => {
    const lowerName = module.name.toLowerCase();

    if (!groupedModules[lowerName]) {
      groupedModules[lowerName] = [];
    }

    groupedModules[lowerName].push(module);
  });

  for (const name in groupedModules) {

    groupedModules[name].sort((a, b) => 
      new Date(b.created_at) - new Date(a.created_at)
    );

    const latestModule = groupedModules[name][0];
    latestModule.versionCount = groupedModules[name].length;
    result.push(latestModule);
  }

  return result;
}

router.get('/', (req, res) => {
  res.render('index', { 
    title: 'CDN Admin - Inicio',
    user: req.session.user 
  });
});

router.get('/login', (req, res) => {
  if (req.session.isAuthenticated) {
    return res.redirect('/dashboard');
  }
  res.render('login', { 
    title: 'CDN Admin - Login',
    error: req.flash('error'),
    success: req.flash('success')
  });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    req.flash('error', 'Todos los campos son obligatorios');
    return res.redirect('/login');
  }

  authenticateUser(username, password, (err, user, info) => {
    if (err) {
      console.error('Error de autenticación:', err);
      req.flash('error', 'Error interno del servidor');
      return res.redirect('/login');
    }

    if (!user) {
      req.flash('error', info.message || 'Credenciales inválidas');
      return res.redirect('/login');
    }

    req.session.isAuthenticated = true;
    req.session.user = user;

    const returnTo = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;

    res.redirect(returnTo);
  });
});

router.get('/register', (req, res) => {
  if (req.session.isAuthenticated) {
    return res.redirect('/dashboard');
  }
  res.render('register', { 
    title: 'CDN Admin - Registro',
    error: req.flash('error'),
    success: req.flash('success')
  });
});

router.post('/register', (req, res) => {
  const { username, email, password, confirmPassword } = req.body;

  if (!username || !email || !password || !confirmPassword) {
    req.flash('error', 'Todos los campos son obligatorios');
    return res.redirect('/register');
  }

  if (password !== confirmPassword) {
    req.flash('error', 'Las contraseñas no coinciden');
    return res.redirect('/register');
  }

  registerUser(username, email, password, (err, user) => {
    if (err) {
      req.flash('error', err.message || 'Error al registrar usuario');
      return res.redirect('/register');
    }

    req.flash('success', 'Registro exitoso. Ya puedes iniciar sesión');
    res.redirect('/login');
  });
});

router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error al cerrar sesión:', err);
    }
    res.redirect('/login');
  });
});

router.get('/dashboard', isAuthenticated, (req, res) => {
  db.all('SELECT * FROM modules ORDER BY created_at DESC', [], (err, allModules) => {
    if (err) {
      console.error('Error al obtener módulos:', err);
      req.flash('error', 'Error al cargar los módulos');
      allModules = [];
    }

    const groupedModules = {};
    const modules = [];

    if (allModules && allModules.length > 0) {
      allModules.forEach(module => {
        const lowerName = module.name.toLowerCase();

        if (!groupedModules[lowerName]) {
          groupedModules[lowerName] = [];
        }

        groupedModules[lowerName].push(module);
      });

      for (const name in groupedModules) {

        groupedModules[name].sort((a, b) => 
          new Date(b.created_at) - new Date(a.created_at)
        );

        const latestModule = groupedModules[name][0];
        latestModule.versionCount = groupedModules[name].length;
        modules.push(latestModule);
      }
    }

    db.get('SELECT * FROM base_source ORDER BY created_at DESC LIMIT 1', [], (err, baseSource) => {
      if (err) {
        console.error('Error al obtener base_source:', err);
        req.flash('error', 'Error al cargar el proyecto base');
      }

      res.render('dashboard', { 
        title: 'CDN Admin - Dashboard',
        user: req.session.user,
        modules: modules,
        baseSource: baseSource || null,
        error: req.flash('error'),
        success: req.flash('success')
      });
    });
  });
});

router.post('/base-source/add', isAuthenticated, baseUpload.single('baseFile'), (req, res) => {
  if (!req.file) {
    req.flash('error', 'Debes subir un archivo ZIP');
    return res.redirect('/dashboard');
  }

  const { description, version } = req.body;

  if (!version) {
    req.flash('error', 'La versión es obligatoria');
    return res.redirect('/dashboard');
  }

  db.run(
    'INSERT INTO base_source (filename, description, version) VALUES (?, ?, ?)',
    [req.file.originalname, description || '', version],
    function(err) {
      if (err) {
        console.error('Error al guardar proyecto base:', err);
        req.flash('error', 'Error al guardar la información del proyecto base');
        return res.redirect('/dashboard');
      }

      req.flash('success', 'Proyecto base subido correctamente');
      res.redirect('/dashboard');
    }
  );
});

router.post('/base-source/delete/:id', isAuthenticated, (req, res) => {
  const baseId = req.params.id;

  db.get('SELECT * FROM base_source WHERE id = ?', [baseId], (err, baseSource) => {
    if (err || !baseSource) {
      req.flash('error', 'Proyecto base no encontrado');
      return res.redirect('/dashboard');
    }

    db.run('DELETE FROM base_source WHERE id = ?', [baseId], function(err) {
      if (err) {
        console.error('Error al eliminar proyecto base:', err);
        req.flash('error', 'Error al eliminar el proyecto base');
        return res.redirect('/dashboard');
      }

      const filePath = path.join(__dirname, 'public', 'base_source', baseSource.filename);
      fs.unlink(filePath).catch(err => {
        console.warn('No se pudo eliminar el archivo físico:', err);
      });

      req.flash('success', 'Proyecto base eliminado correctamente');
      res.redirect('/dashboard');
    });
  });
});

router.post('/modules/delete/:id', isAuthenticated, (req, res) => {
  const moduleId = req.params.id;

  db.get('SELECT * FROM modules WHERE id = ?', [moduleId], (err, module) => {
    if (err || !module) {
      req.flash('error', 'Módulo no encontrado');
      return res.redirect('/dashboard');
    }

    db.run('DELETE FROM modules WHERE id = ?', [moduleId], function(err) {
      if (err) {
        console.error('Error al eliminar módulo:', err);
        req.flash('error', 'Error al eliminar el módulo');
        return res.redirect('/dashboard');
      }

      try {
        const filePath = path.join(__dirname, 'public', module.type, module.filename);
        fs.unlink(filePath).catch(err => {
          console.warn('No se pudo eliminar el archivo físico:', err);
        });
      } catch (err) {
        console.warn('Error al intentar eliminar el archivo físico:', err);
      }

      req.flash('success', 'Módulo eliminado correctamente');
      res.redirect('/dashboard');
    });
  });
});

router.post('/modules/add', isAuthenticated, upload.single('moduleFile'), (req, res) => {
  if (!req.file) {
    req.flash('error', 'Debes subir un archivo ZIP');
    return res.redirect('/dashboard');
  }

  const { name, type, price, description, version, install_command } = req.body;

  if (!name || !type) {
    req.flash('error', 'Nombre y tipo son obligatorios');
    return res.redirect('/dashboard');
  }

  db.run(
    'INSERT INTO modules (name, filename, type, price, description, version, install_command) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [ name,
      req.file.filename,
      type,
      price || 'free',
      description || '',
      version || '1.0.0',
      install_command || null
    ],
    function(err) {
      if (err) {
        console.error('Error al guardar módulo:', err);
        req.flash('error', 'Error al guardar la información del módulo');
        return res.redirect('/dashboard');
      }

      if (install_command) {
        db.run(
          'INSERT INTO module_metadata (filename, install_command) VALUES (?, ?) ON CONFLICT(filename) DO UPDATE SET install_command = ?',
          [req.file.originalname, install_command, install_command],
          function(metaErr) {
            if (metaErr) {
              console.error('Error al guardar el comando de instalación:', metaErr);
            }
          }
        );
      }

      req.flash('success', 'Módulo añadido correctamente');
      res.redirect('/dashboard');
    }
  );
});

router.get('/licenses', isAuthenticated, (req, res) => {
  db.all('SELECT * FROM licenses ORDER BY created_at DESC', [], (err, licenses) => {
    if (err) {
      console.error('Error al obtener licencias:', err);
      req.flash('error', 'Error al cargar las licencias');
      return res.render('licenses', { 
        title: 'CDN Admin - Licencias',
        user: req.session.user,
        licenses: [],
        error: req.flash('error'),
        success: req.flash('success')
      });
    }

    res.render('licenses', { 
      title: 'CDN Admin - Licencias',
      user: req.session.user,
      licenses: licenses,
      error: req.flash('error'),
      success: req.flash('success')
    });
  });
});

router.get('/applications', isAuthenticated, (req, res) => {
  db.all('SELECT * FROM applications ORDER BY platform, name', [], (err, applications) => {
    if (err) {
      console.error('Error al obtener aplicaciones:', err);
      req.flash('error', 'Error al cargar las aplicaciones');
    }

    res.render('applications', { 
      title: 'CDN Admin - Aplicaciones',
      user: req.session.user,
      applications: err ? [] : applications,
      error: req.flash('error'),
      success: req.flash('success')
    });
  });
});

router.post('/applications/add', isAuthenticated, applicationUpload.single('appFile'), (req, res) => {
  if (!req.file) {
    req.flash('error', 'Debes subir un archivo');
    return res.redirect('/applications');
  }

  const { name, platform, version, changelog, releaseNotes } = req.body;

  if (!name || !platform || !version) {
    req.flash('error', 'Nombre, plataforma y versión son obligatorios');
    return res.redirect('/applications');
  }

  db.run(
    'INSERT INTO applications (name, platform, version, filename, changelog, release_notes) VALUES (?, ?, ?, ?, ?, ?)',
    [name, platform, version, req.file.filename, changelog || '', releaseNotes || ''],
    function(err) {
      if (err) {
        console.error('Error al guardar aplicación:', err);
        req.flash('error', 'Error al guardar la información de la aplicación');
        return res.redirect('/applications');
      }

      req.flash('success', 'Aplicación añadida correctamente');
      res.redirect('/applications');
    }
  );
});

router.post('/applications/delete/:id', isAuthenticated, (req, res) => {
  const appId = req.params.id;

  db.get('SELECT * FROM applications WHERE id = ?', [appId], (err, app) => {
    if (err || !app) {
      req.flash('error', 'Aplicación no encontrada');
      return res.redirect('/applications');
    }

    db.run('DELETE FROM applications WHERE id = ?', [appId], function(err) {
      if (err) {
        console.error('Error al eliminar aplicación:', err);
        req.flash('error', 'Error al eliminar la aplicación');
        return res.redirect('/applications');
      }

      const filePath = path.join(__dirname, 'public', 'applications', app.filename);
      fs.unlink(filePath).catch(err => {
        console.warn('No se pudo eliminar el archivo físico:', err);
      });

      req.flash('success', 'Aplicación eliminada correctamente');
      res.redirect('/applications');
    });
  });
});

module.exports = router;
const express = require('express');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const cors = require('cors');
const fs = require('fs').promises;

const routes = require('./routes');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3344;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

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
    path.join(__dirname, 'public', 'base_source')
  ];
  
  for (const dir of directories) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (err) {
      console.error(`Error al crear directorio ${dir}:`, err);
    }
  }
}

app.use('/', routes);

const VALID_LICENSES = ['EXNET-PIZZA-2024-001', 'EXNET-PIZZA-2024-002'];
const activeDownloads = new Map();

async function listModules(directory, moduleType) {
  try {
    const files = await fs.readdir(directory);
    return files
      .filter(file => file.endsWith('.zip'))
      .map(file => {
        return new Promise((resolve) => {
          db.get('SELECT * FROM modules WHERE filename = ? AND type = ?', [file, moduleType], (err, module) => {
            if (err || !module) {
              resolve({
                filename: file,
                price: 'free',
                downloadUrl: `/api/download/${moduleType}/${file}`
              });
            } else {
              resolve({
                filename: file,
                price: module.price,
                downloadUrl: module.price === 'premium' ? null : `/api/download/${moduleType}/${file}`
              });
            }
          });
        });
      });
      
    const resolvedModules = await Promise.all(files);
    return resolvedModules;
  } catch (error) {
    console.error(`Error leyendo ${directory}:`, error);
    return [];
  }
}

app.get('/api/download/base_source/:filename', async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, 'public', 'base_source', filename);

  try {
    await fs.access(filePath);
    res.download(filePath);
  } catch (error) {
    res.status(404).json({ error: 'Archivo no encontrado' });
  }
});

app.get('/api/modules/:moduleType', async (req, res) => {
  const { moduleType } = req.params;
  const modulePath = path.join(__dirname, 'public', moduleType);

  try {
    await fs.access(modulePath);
  } catch {
    return res.json({ moduleType, modules: [] });
  }

  const modules = await listModules(modulePath, moduleType);
  res.json({ moduleType, modules });
});

app.get('/api/marketplace', async (req, res) => {
  try {
    const modules = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM modules ORDER BY type, name', (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });

    if (!modules || modules.length === 0) {
      return res.json({ marketplace: {} });
    }

    const modulesByType = {};

    for (const module of modules) {
      if (!modulesByType[module.type]) {
        modulesByType[module.type] = [];
      }

      modulesByType[module.type].push({
        id: module.id,
        name: module.name,
        filename: module.filename,
        description: module.description,
        version: module.version,
        price: module.price,
        installCommand: module.install_command || null,
        downloadUrl: module.price === 'premium' ? null : `/api/download/${module.type}/${module.filename}`
      });
    }

    res.json({ marketplace: modulesByType });
  } catch (error) {
    console.error('Error al obtener módulos del marketplace:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/module-metadata', (req, res) => {
  const { filename, installCommand } = req.body;
  
  if (!filename) {
    return res.status(400).json({ error: 'El nombre del archivo es requerido' });
  }
  
  db.get('SELECT * FROM module_metadata WHERE filename = ?', [filename], (err, metadata) => {
    if (err) {
      console.error('Error al buscar metadatos:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
    
    if (metadata) {
      db.run('UPDATE module_metadata SET install_command = ? WHERE filename = ?', 
        [installCommand, filename], 
        function(err) {
          if (err) {
            console.error('Error al actualizar metadatos:', err);
            return res.status(500).json({ error: 'Error al actualizar metadatos' });
          }
          
          res.json({ success: true, message: 'Metadatos actualizados' });
        }
      );
    } else {
      db.run('INSERT INTO module_metadata (filename, install_command) VALUES (?, ?)', 
        [filename, installCommand], 
        function(err) {
          if (err) {
            console.error('Error al insertar metadatos:', err);
            return res.status(500).json({ error: 'Error al guardar metadatos' });
          }
          
          res.json({ success: true, message: 'Metadatos guardados' });
        }
      );
    }
  });
});

app.put('/api/update-module/:id', async (req, res) => {
  const { id } = req.params;
  const { name, type, version, price, description, install_command } = req.body;

  if (!name || !type) {
    return res.status(400).json({ error: 'Nombre y tipo son obligatorios' });
  }

  try {
    db.run(
      `UPDATE modules 
       SET name = ?, type = ?, version = ?, price = ?, description = ?, install_command = ? 
       WHERE id = ?`,
      [name, type, version || '1.0.0', price || 'free', description || '', install_command || null, id],
      function(err) {
        if (err) {
          console.error('Error al actualizar el módulo:', err);
          return res.status(500).json({ error: 'Error al actualizar el módulo' });
        }

        if (this.changes === 0) {
          return res.status(404).json({ error: 'Módulo no encontrado' });
        }

        res.json({ success: true, message: 'Módulo actualizado correctamente' });
      }
    );
  } catch (error) {
    console.error('Error al actualizar el módulo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/module-info-by-id/:id', async (req, res) => {
  const { id } = req.params;

  try {
    db.get('SELECT * FROM modules WHERE id = ?', [id], (err, module) => {
      if (err) {
        console.error('Error al obtener información del módulo:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
      }

      if (!module) {
        return res.status(404).json({ error: 'Módulo no encontrado' });
      }

      return res.json({
        module: {
          id: module.id,
          name: module.name,
          filename: module.filename,
          description: module.description,
          version: module.version,
          price: module.price,
          installCommand: module.install_command || `cd src/${module.filename.replace('.zip', '')} && composer install`,
          type: module.type
        }
      });
    });
  } catch (error) {
    console.error('Error al obtener información del módulo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/module-info/:moduleType/:filename', async (req, res) => {
  const { moduleType, filename } = req.params;
  const filePath = path.join(__dirname, 'public', moduleType, filename);

  try {
    // Verificar si el archivo existe en el sistema de archivos
    await fs.access(filePath);

    // Consultar la base de datos para obtener información del módulo
    db.get(
      'SELECT * FROM modules WHERE filename = ? AND type = ?',
      [filename, moduleType],
      async (err, module) => {
        if (err) {
          console.error('Error al consultar módulo en la base de datos:', err);
          return res.status(500).json({ error: 'Error interno del servidor' });
        }

        if (module) {
          // Si el módulo está en la base de datos, devolver la información completa
          return res.json({
            module: {
              id: module.id,
              name: module.name,
              filename: module.filename,
              description: module.description || 'Sin descripción disponible',
              version: module.version || '1.0.0',
              price: module.price || 'free',
              installCommand:
                module.install_command ||
                `cd src/${module.filename.replace('.zip', '')} && composer install`,
              type: module.type,
              downloadUrl:
                module.price === 'premium'
                  ? null
                  : `/api/download/${module.type}/${module.filename}`,
            },
          });
        } else {
          // Si no está en la base de datos, devolver información básica basada en el archivo
          return res.json({
            module: {
              name: filename.replace('.zip', ''),
              filename: filename,
              description: 'Módulo no registrado en la base de datos',
              version: '1.0.0',
              price: 'free',
              installCommand: `cd src/${filename.replace(
                '.zip',
                ''
              )} && composer install`,
              type: moduleType,
              downloadUrl: `/api/download/${moduleType}/${filename}`,
            },
          });
        }
      }
    );
  } catch (error) {
    // Si el archivo no existe en el sistema de archivos
    console.error(`Archivo no encontrado en ${filePath}:`, error);
    return res.status(404).json({ error: 'Módulo no encontrado' });
  }
});

app.get('/api/download/:moduleType/:filename', async (req, res) => {
  const { moduleType, filename } = req.params;
  const { token } = req.query;
  const filePath = path.join(__dirname, 'public', moduleType, filename);

  console.log(`Attempting download from: ${filePath}`); // Log para depuración

  try {
      await fs.access(filePath);

      db.get('SELECT * FROM modules WHERE filename = ? AND type = ?', [filename, moduleType], (err, module) => {
          if (err) {
              console.error('Error al verificar módulo (download):', err);
              return res.status(500).json({ error: 'Error interno del servidor' });
          }

          if (!module || module.price !== 'premium') {
              console.log(`Serving non-premium or non-DB module: ${filename}`);
              return res.download(filePath);
          }

          // Lógica para módulos premium
          if (!token || !activeDownloads.has(token)) {
              console.log(`Access denied for premium module ${filename}. Missing or invalid token.`);
              return res.status(403).json({ error: 'Acceso denegado. Licencia requerida.' });
          }

          const downloadData = activeDownloads.get(token);
          if (downloadData.moduleFilename !== filename || Date.now() > downloadData.expires) {
              console.log(`Token invalid/expired for ${filename}.`);
              activeDownloads.delete(token);
              return res.status(403).json({ error: 'Token inválido o expirado.' });
          }

          console.log(`Serving premium module ${filename} with valid token.`);
          activeDownloads.delete(token);
          res.download(filePath);
      });
  } catch (error) {
      console.error(`File not found at ${filePath}:`, error.code);
      res.status(404).json({ error: 'Archivo no encontrado' });
  }
});

app.post('/api/verify-license', (req, res) => {
  const { license, moduleFilename } = req.body;
  
  if (!license || !moduleFilename) {
    return res.status(400).json({ valid: false, message: 'Licencia y nombre de módulo son requeridos' });
  }
  
  db.get('SELECT * FROM licenses WHERE license_key = ? AND active = 1', [license], (err, licenseRecord) => {
    if (err) {
      console.error('Error al verificar licencia:', err);
      return res.status(500).json({ valid: false, message: 'Error interno del servidor' });
    }
    
    if (!licenseRecord) {
      return res.status(403).json({ valid: false, message: 'Licencia inválida' });
    }
    
    db.get('SELECT * FROM modules WHERE filename = ?', [moduleFilename], (err, module) => {
      if (err) {
        console.error('Error al verificar módulo:', err);
        return res.status(500).json({ valid: false, message: 'Error interno del servidor' });
      }
      
      if (!module) {
        return res.status(404).json({ valid: false, message: 'Módulo no encontrado' });
      }
      
      if (module.price !== 'premium') {
        return res.json({ valid: true, message: 'Módulo gratuito, no requiere licencia' });
      }
      
      const token = `${moduleFilename}-${Date.now()}`;
      activeDownloads.set(token, { 
        moduleFilename, 
        expires: Date.now() + 5 * 60 * 1000
      });
      
      return res.json({ valid: true, message: 'Licencia válida', downloadToken: token });
    });
  });
});

app.get('/api/download/:moduleType/:filename', async (req, res) => {
  const { moduleType, filename } = req.params;
  const { token } = req.query;
  const filePath = path.join(__dirname, 'public', 'default', filename);

  try {
    await fs.access(filePath); 

    // --- Lógica de verificación de licencia (si aplica) ---
    db.get('SELECT * FROM modules WHERE filename = ?', [filename], (err, module) => {
      if (err) {
        console.error('Error al verificar módulo:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
      }

      // Si no está en la DB o no es premium, permite la descarga directa
      if (!module || module.price !== 'premium') { 
        return res.download(filePath); // <-- Intenta descargar desde filePath
      }

      // --- Resto de la lógica de token para premium ---
      if (!token || !activeDownloads.has(token)) {
        return res.status(403).json({ error: 'Acceso denegado. Licencia requerida.' });
      }
      // ... validación de token ...
      activeDownloads.delete(token);
      res.download(filePath); // <-- Intenta descargar desde filePath (para premium con token válido)
    });
  } catch (error) {
    // SI fs.access falla (porque el archivo no existe en filePath), entra aquí
    res.status(404).json({ error: 'Archivo no encontrado' }); // <--- Este es el error que recibes
  }
});

createDirectories().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
  });
});
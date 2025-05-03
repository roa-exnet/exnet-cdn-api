const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const db = require('../db/database');
const multer = require('multer');

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

router.get('/download/base_source/:filename', async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, 'public', 'base_source', filename);

  try {
    await fs.access(filePath);
    res.download(filePath);
  } catch (error) {
    res.status(404).json({ error: 'Archivo no encontrado' });
  }
});

router.get('/modules/:moduleType', async (req, res) => {
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

router.get('/marketplace', async (req, res) => {
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

router.post('/module-metadata', (req, res) => {
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

router.put('/update-module/:id', async (req, res) => {
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

router.get('/module-info-by-id/:id', async (req, res) => {
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

router.get('/module-info/:moduleType/:filename', async (req, res) => {
  const { moduleType, filename } = req.params;
  const filePath = path.join(__dirname, 'public', moduleType, filename);

  try {

    await fs.access(filePath);

    db.get(
      'SELECT * FROM modules WHERE filename = ? AND type = ?',
      [filename, moduleType],
      async (err, module) => {
        if (err) {
          console.error('Error al consultar módulo en la base de datos:', err);
          return res.status(500).json({ error: 'Error interno del servidor' });
        }

        if (module) {

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

    console.error(`Archivo no encontrado en ${filePath}:`, error);
    return res.status(404).json({ error: 'Módulo no encontrado' });
  }
});

router.get('/download/:moduleType/:filename', async (req, res) => {
  const { moduleType, filename } = req.params;
  const { token } = req.query;
  const filePath = path.join(__dirname, 'public', moduleType, filename);

  console.log(`Attempting download from: ${filePath}`); 

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

router.post('/verify-license', (req, res) => {
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

router.get('/applications', async (req, res) => {
  try {
    db.all('SELECT * FROM applications ORDER BY platform, name', [], (err, applications) => {
      if (err) {
        console.error('Error al obtener listado de aplicaciones:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
      }

      return res.json({ applications });
    });
  } catch (error) {
    console.error('Error al obtener listado de aplicaciones:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/applications/:platform', async (req, res) => {
  const { platform } = req.params;

  try {
    db.all('SELECT * FROM applications WHERE platform = ? ORDER BY name', [platform], (err, applications) => {
      if (err) {
        console.error('Error al obtener aplicaciones por plataforma:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
      }

      return res.json({ platform, applications });
    });
  } catch (error) {
    console.error('Error al obtener aplicaciones por plataforma:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/application-info/:id', async (req, res) => {
  const { id } = req.params;

  try {
    db.get('SELECT * FROM applications WHERE id = ?', [id], (err, app) => {
      if (err) {
        console.error('Error al obtener información de la aplicación:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
      }

      if (!app) {
        return res.status(404).json({ error: 'Aplicación no encontrada' });
      }

      return res.json({
        application: {
          id: app.id,
          name: app.name,
          platform: app.platform,
          version: app.version,
          filename: app.filename,
          changelog: app.changelog,
          release_notes: app.release_notes,
          created_at: app.created_at,
          updated_at: app.updated_at
        }
      });
    });
  } catch (error) {
    console.error('Error al obtener información de la aplicación:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/download/applications/:filename', async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, 'public', 'applications', filename);

  try {
    await fs.access(filePath);
    res.download(filePath);
  } catch (error) {
    res.status(404).json({ error: 'Archivo no encontrado' });
  }
});

router.post('/applications', applicationUpload.single('appFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Debes subir un archivo' });
  }

  const { name, platform, version, changelog, releaseNotes } = req.body;

  if (!name || !platform || !version) {
    return res.status(400).json({ error: 'Nombre, plataforma y versión son obligatorios' });
  }

  db.run(
    'INSERT INTO applications (name, platform, version, filename, changelog, release_notes) VALUES (?, ?, ?, ?, ?, ?)',
    [name, platform, version, req.file.filename, changelog || '', releaseNotes || ''],
    function(err) {
      if (err) {
        console.error('Error al guardar aplicación:', err);
        return res.status(500).json({ error: 'Error al guardar la información de la aplicación' });
      }

      return res.status(201).json({ 
        success: true, 
        message: 'Aplicación añadida correctamente',
        application: {
          id: this.lastID,
          name,
          platform,
          version,
          filename: req.file.filename,
          changelog: changelog || '',
          release_notes: releaseNotes || ''
        }
      });
    }
  );
});

router.delete('/applications/:id', (req, res) => {
  const appId = req.params.id;

  db.get('SELECT * FROM applications WHERE id = ?', [appId], (err, app) => {
    if (err || !app) {
      return res.status(404).json({ error: 'Aplicación no encontrada' });
    }

    db.run('DELETE FROM applications WHERE id = ?', [appId], function(err) {
      if (err) {
        console.error('Error al eliminar aplicación:', err);
        return res.status(500).json({ error: 'Error al eliminar la aplicación' });
      }

      const filePath = path.join(__dirname, 'public', 'applications', app.filename);
      fs.unlink(filePath).catch(err => {
        console.warn('No se pudo eliminar el archivo físico:', err);
      });

      return res.json({ success: true, message: 'Aplicación eliminada correctamente' });
    });
  });
});

router.get('/check-update/:platform/:appName/:currentVersion', async (req, res) => {
  const { platform, appName, currentVersion } = req.params;

  try {
    db.get(
      'SELECT * FROM applications WHERE platform = ? AND name = ? ORDER BY created_at DESC LIMIT 1',
      [platform, appName],
      (err, app) => {
        if (err) {
          console.error('Error al verificar actualización:', err);
          return res.status(500).json({ error: 'Error interno del servidor' });
        }

        if (!app) {
          return res.json({ 
            updateAvailable: false, 
            message: 'No se encontraron actualizaciones' 
          });
        }

        const needsUpdate = app.version !== currentVersion;
        const response = {
          updateAvailable: needsUpdate,
          currentVersion: currentVersion,
          latestVersion: app.version,
          downloadUrl: needsUpdate ? `/api/download/applications/${app.filename}` : null,
          changelog: needsUpdate ? app.changelog : null,
          releaseNotes: needsUpdate ? app.release_notes : null
        };

        res.json(response);
      }
    );
  } catch (error) {
    console.error('Error al verificar actualización:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
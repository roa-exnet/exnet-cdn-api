const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const VALID_LICENSES = ['EXNET-PIZZA-2024-001', 'EXNET-PIZZA-2024-002'];

const MODULES_INFO = {
    moduloStreaming: [
        {
            name: 'moduloStreaming',
            filename: 'moduloStreaming.zip',
            type: 'streaming',
            price: 'premium',
            description: 'Módulo de streaming para la aplicación',
            version: '1.0.0'
        }
    ]
};

const activeDownloads = new Map();

async function listModules(directory, moduleType) {
    try {
        const files = await fs.readdir(directory);
        return files
            .filter(file => file.endsWith('.zip'))
            .map(file => {
                const module = MODULES_INFO[moduleType]?.find(m => m.filename === file);
                return {
                    filename: file,
                    price: module?.price || 'free',
                    downloadUrl: module?.price === 'premium' ? null : `/download/${moduleType}/${file}`
                };
            });
    } catch (error) {
        console.error(`Error leyendo ${directory}:`, error);
        return [];
    }
}

app.get('/modules/:moduleType', async (req, res) => {
    const { moduleType } = req.params;
    const modulePath = path.join(__dirname, 'public', moduleType);

    const modules = await listModules(modulePath, moduleType);
    res.json({ moduleType, modules });
});

app.post('/verify-license', (req, res) => {
    const { license, moduleFilename } = req.body;
    const module = MODULES_INFO.moduloStreaming.find(m => m.filename === moduleFilename);

    if (!module) {
        return res.status(404).json({ valid: false, message: 'Módulo no encontrado' });
    }

    if (module.price !== 'premium') {
        return res.json({ valid: true, message: 'Módulo gratuito, no requiere licencia' });
    }

    if (VALID_LICENSES.includes(license)) {
        const token = `${moduleFilename}-${Date.now()}`;
        activeDownloads.set(token, { moduleFilename, expires: Date.now() + 5 * 60 * 1000 }); // Expira en 5 minutos

        return res.json({ valid: true, message: 'Licencia válida', downloadToken: token });
    }

    res.status(403).json({ valid: false, message: 'Licencia inválida' });
});

app.get('/download/:moduleType/:filename', async (req, res) => {
    const { moduleType, filename } = req.params;
    const { token } = req.query;
    const filePath = path.join(__dirname, 'public', moduleType, filename);

    const module = MODULES_INFO[moduleType]?.find(m => m.filename === filename);

    if (!module) {
        return res.status(404).json({ error: 'Módulo no encontrado' });
    }

    if (module.price === 'premium') {
        if (!token || !activeDownloads.has(token)) {
            return res.status(403).json({ error: 'Acceso denegado. Licencia requerida.' });
        }

        const { moduleFilename, expires } = activeDownloads.get(token);

        if (moduleFilename !== filename || Date.now() > expires) {
            activeDownloads.delete(token);
            return res.status(403).json({ error: 'Token inválido o expirado.' });
        }

        activeDownloads.delete(token);
    }

    try {
        await fs.access(filePath);
        res.download(filePath);
    } catch {
        res.status(404).json({ error: 'Archivo no encontrado' });
    }
});

app.listen(PORT, () => console.log(`API ejecutándose en http://localhost:${PORT}`));

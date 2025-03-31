const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_BASE_URL = 'http://localhost:4000';
const MODULE_TYPE = 'moduloStreaming';
const MODULE_FILENAME = 'moduloStreaming.zip';
const LICENSE_KEY = 'EXNET-PIZZA-2024-001';
const OUTPUT_DIR = './downloads';

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function downloadModule() {
    try {
        console.log(`Iniciando descarga del módulo ${MODULE_FILENAME}...`);
        
        console.log('Verificando licencia...');
        const licenseResponse = await axios.post(`${API_BASE_URL}/verify-license`, {
            license: LICENSE_KEY,
            moduleFilename: MODULE_FILENAME
        });

        if (!licenseResponse.data.valid) {
            console.error(`Error: ${licenseResponse.data.message}`);
            return;
        }

        const { downloadToken } = licenseResponse.data;
        console.log(`Licencia verificada: ${licenseResponse.data.message}`);
        
        console.log('Iniciando descarga del archivo...');
        const outputPath = path.join(OUTPUT_DIR, MODULE_FILENAME);
        
        const response = await axios({
            url: `${API_BASE_URL}/download/${MODULE_TYPE}/${MODULE_FILENAME}?token=${downloadToken}`,
            method: 'GET',
            responseType: 'stream'
        });

        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                console.log(`Módulo descargado exitosamente en: ${outputPath}`);
                resolve();
            });
            
            writer.on('error', (err) => {
                console.error('Error al guardar el archivo:', err);
                reject(err);
            });
        });
    } catch (error) {
        if (error.response) {
            console.error('Error en la respuesta del servidor:', error.response.status);
            console.error('Mensaje:', error.response.data);
        } else if (error.request) {
            console.error('Error de conexión. Verifica que el servidor esté funcionando:', error.message);
        } else {
            console.error('Error:', error.message);
        }
    }
}

downloadModule().catch(err => {
    console.error('Error general:', err);
    process.exit(1);
});
document.addEventListener('DOMContentLoaded', function() {
  const viewDetailsButtons = document.querySelectorAll('.view-details-btn');
  viewDetailsButtons.forEach(button => {
    button.addEventListener('click', async function() {
      const moduleId = this.getAttribute('data-module-id');

      try {
        const response = await fetch(`/api/module-info-by-id/${moduleId}`);
        if (!response.ok) {
          throw new Error('Error al obtener los detalles del módulo');
        }

        const data = await response.json();
        const module = data.module;

        document.getElementById('moduleName').textContent = module.name || 'No disponible';
        document.getElementById('moduleType').textContent = module.type || 'No disponible';
        document.getElementById('moduleVersion').textContent = module.version || 'No disponible';
        document.getElementById('modulePrice').textContent = module.price === 'premium' ? 'Premium' : 'Gratuito';
        document.getElementById('moduleDescription').textContent = module.description || 'Sin descripción';
        document.getElementById('moduleInstallCommand').textContent = module.installCommand || 'No disponible';
        document.getElementById('moduleFilename').textContent = module.filename || 'No disponible';
      } catch (error) {
        console.error('Error:', error);
        document.getElementById('moduleDetailsContent').innerHTML = `
          <p class="text-danger">Error al cargar los detalles del módulo. Por favor, intenta de nuevo.</p>
        `;
      }
    });
  });

  const editModuleButtons = document.querySelectorAll('.edit-module-btn');
  editModuleButtons.forEach(button => {
    button.addEventListener('click', async function() {
      const moduleId = this.getAttribute('data-module-id');

      try {
        const response = await fetch(`/api/module-info-by-id/${moduleId}`);
        if (!response.ok) {
          throw new Error('Error al obtener los detalles del módulo para editar');
        }

        const data = await response.json();
        const module = data.module;

        document.getElementById('editModuleId').value = module.id;
        document.getElementById('editModuleName').value = module.name || '';
        document.getElementById('editModuleType').value = module.type || '';
        document.getElementById('editModuleVersion').value = module.version || '';
        document.getElementById('editModulePrice').value = module.price || 'free';
        document.getElementById('editModuleDescription').value = module.description || '';
        document.getElementById('editModuleInstallCommand').value = module.installCommand || '';
        document.getElementById('editModuleFilename').value = module.filename || '';

        document.getElementById('editModuleError').style.display = 'none';
      } catch (error) {
        console.error('Error:', error);
        document.getElementById('editModuleError').textContent = 'Error al cargar los detalles del módulo para editar.';
        document.getElementById('editModuleError').style.display = 'block';
      }
    });
  });

  document.getElementById('saveModuleChangesBtn').addEventListener('click', async function() {
    const form = document.getElementById('editModuleForm');
    const formData = new FormData(form);
    const moduleId = document.getElementById('editModuleId').value;

    const updatedModule = {
      name: formData.get('name'),
      type: formData.get('type'),
      version: formData.get('version'),
      price: formData.get('price'),
      description: formData.get('description'),
      install_command: formData.get('install_command')
    };

    try {
      const response = await fetch(`/api/update-module/${moduleId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatedModule)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al actualizar el módulo');
      }

      const modal = bootstrap.Modal.getInstance(document.getElementById('editModuleModal'));
      modal.hide();
      window.location.reload();
    } catch (error) {
      console.error('Error:', error);
      document.getElementById('editModuleError').textContent = error.message;
      document.getElementById('editModuleError').style.display = 'block';
    }
  });

  const viewAppDetailsButtons = document.querySelectorAll('.view-app-details-btn');
  viewAppDetailsButtons.forEach(button => {
    button.addEventListener('click', async function() {
      const appId = this.getAttribute('data-app-id');

      try {
        const response = await fetch(`/api/application-info/${appId}`);
        if (!response.ok) {
          throw new Error('Error al obtener los detalles de la aplicación');
        }

        const data = await response.json();
        const app = data.application;

        document.getElementById('appName').textContent = app.name || 'No disponible';
        document.getElementById('appPlatform').textContent = app.platform || 'No disponible';
        document.getElementById('appVersion').textContent = app.version || 'No disponible';
        document.getElementById('appFilename').textContent = app.filename || 'No disponible';

        const createdAt = new Date(app.created_at);
        document.getElementById('appCreatedAt').textContent = createdAt.toLocaleString('es-ES', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        document.getElementById('appChangelog').textContent = app.changelog || 'Sin changelog';
        document.getElementById('appReleaseNotes').textContent = app.release_notes || 'Sin notas de lanzamiento';
      } catch (error) {
        console.error('Error:', error);
        document.getElementById('appDetailsContent').innerHTML = `
          <p class="text-danger">Error al cargar los detalles de la aplicación. Por favor, intenta de nuevo.</p>
        `;
      }
    });
  });
});

async function showModuleVersions(moduleId) {
  try {
    const response = await fetch(`/api/module-versions/${moduleId}`);
    if (!response.ok) {
      throw new Error('Error al obtener las versiones del módulo');
    }

    const data = await response.json();

    document.getElementById('moduleVersionsTitle').textContent = `Versiones de ${data.module.name}`;

    const versionsTableBody = document.getElementById('moduleVersionsTableBody');
    versionsTableBody.innerHTML = '';

    data.versions.forEach(version => {
      const row = document.createElement('tr');

      if (version.isCurrent) {
        row.classList.add('table-primary2', 'current-version');
      }

      const createdDate = new Date(version.created_at);
      const formattedDate = createdDate.toLocaleDateString('es-ES', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });

      row.innerHTML = `
        <td>${version.version}</td>
        <td>${version.filename}</td>
        <td>${formattedDate}</td>
        <td>
          <div class="btn-group btn-group-sm" role="group">
            <button 
              type="button" 
              class="btn btn-outline-info view-details-btn" 
              data-bs-toggle="modal" 
              data-bs-target="#moduleDetailsModal" 
              data-module-id="${version.id}" 
              title="Ver detalles">
              <i class="fas fa-eye"></i>
            </button>
            <a href="/api/download/${data.module.type}/${version.filename}" 
               class="btn btn-outline-primary" 
               title="Descargar">
              <i class="fas fa-download"></i>
            </a>
          </div>
        </td>
      `;

      versionsTableBody.appendChild(row);
    });

    const moduleVersionsModal = new bootstrap.Modal(document.getElementById('moduleVersionsModal'));
    moduleVersionsModal.show();
  } catch (error) {
    console.error('Error:', error);
    alert('Error al cargar las versiones del módulo');
  }
}

document.addEventListener('DOMContentLoaded', function() {
  const showVersionsButtons = document.querySelectorAll('.show-versions-btn');
  showVersionsButtons.forEach(button => {
    button.addEventListener('click', function() {
      const moduleId = this.getAttribute('data-module-id');
      showModuleVersions(moduleId);
    });
  });
});
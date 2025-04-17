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
});
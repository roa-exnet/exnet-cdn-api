document.addEventListener('DOMContentLoaded', function() {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    const tooltipList = tooltipTriggerList.map(function(tooltipTriggerEl) {
      return new bootstrap.Tooltip(tooltipTriggerEl);
    });
    
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(function(alert) {
      setTimeout(function() {
        const bsAlert = new bootstrap.Alert(alert);
        bsAlert.close();
      }, 5000);
    });
    
    const registerForm = document.querySelector('form[action="/register"]');
    if (registerForm) {
      registerForm.addEventListener('submit', function(event) {
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        if (password !== confirmPassword) {
          event.preventDefault();
          alert('Las contraseñas no coinciden');
        }
      });
    }
    
    const moduleForm = document.querySelector('form[action="/modules/add"]');
    if (moduleForm) {
      moduleForm.addEventListener('submit', function(event) {
        const fileInput = document.getElementById('moduleFile');
        const fileExtension = fileInput.value.split('.').pop().toLowerCase();
        
        if (fileExtension !== 'zip') {
          event.preventDefault();
          alert('Por favor, selecciona un archivo ZIP');
        }
      });
    }
    
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
      if (link.getAttribute('href') === currentPath) {
        link.classList.add('active');
      }
    });
  });
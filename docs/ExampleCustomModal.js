/**
 * FightPlanner Custom Plugin Example
 * This script showcases how to use the window.modalManager.showCustomModal API.
 * 
 * To use this:
 * 1. Go to the Customization tab in FightPlanner
 * 2. Add Custom JS
 * 3. Select this file
 */

(function() {
  // We wait a brief moment to ensure UI is ready, or hook into an existing event if available.
  // For demonstration, we'll just add a button to the top left of the screen.

  const pluginId = 'example-modal-plugin-btn';
  
  // Cleanup previous instance if reloaded
  const existingBtn = document.getElementById(pluginId);
  if (existingBtn) {
    existingBtn.remove();
  }

  const btn = document.createElement('button');
  btn.id = pluginId;
  btn.innerHTML = '<i class="bi bi-box"></i> Test Modal API';
  btn.style.position = 'fixed';
  btn.style.top = '10px';
  btn.style.left = '50%';
  btn.style.transform = 'translateX(-50%)';
  btn.style.zIndex = '99999';
  btn.style.padding = '8px 16px';
  btn.style.background = '#ff9800';
  btn.style.color = '#fff';
  btn.style.border = 'none';
  btn.style.borderRadius = '8px';
  btn.style.cursor = 'pointer';
  btn.style.fontWeight = 'bold';
  btn.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';

  btn.addEventListener('click', () => {
    if (!window.modalManager) {
      alert('Modal Manager is not available!');
      return;
    }

    window.modalManager.showCustomModal({
      title: 'Hello from Custom JS',
      size: 'normal',
      clickOverlayToClose: true,
      body: `
        <div style="text-align: center; padding: 20px;">
          <i class="bi bi-controller" style="font-size: 48px; color: #4caf50; display: block; margin-bottom: 16px;"></i>
          <h4 style="margin-bottom: 10px;">Plugin API is working!</h4>
          <p style="color: #aaa; margin-bottom: 20px;">This modal was generated completely from an external JavaScript file using the <strong>Customization</strong> tab.</p>
          
          <div style="background: rgba(0,0,0,0.2); border-radius: 8px; padding: 16px; text-align: left;">
            <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
              <input type="checkbox" id="example-plugin-checkbox" style="width: 18px; height: 18px;">
              <span>I acknowledge this is awesome</span>
            </label>
          </div>
        </div>
      `,
      buttons: [
        {
          text: 'Confirm',
          type: 'primary',
          closeOnClick: false, // We handle it manually
          onClick: async (e, modalElement) => {
            const checkbox = modalElement.querySelector('#example-plugin-checkbox');
            if (checkbox && checkbox.checked) {
              if (window.toastManager) {
                window.toastManager.success('toasts.settingsSaved', { defaultValue: 'Awesome acknowledged!' });
              }
              window.modalManager.closeModal(modalElement);
            } else {
              window.modalManager.showAlert('warning', 'Confirm', 'Please check the box first!');
            }
          }
        },
        {
          text: 'Cancel',
          type: 'secondary'
          // closeOnClick is true by default
        }
      ]
    });
  });

  document.body.appendChild(btn);
  
  if (window.toastManager) {
    window.toastManager.info('Example plugin loaded! Click the button at the top to test.');
  } else {
    console.log('Example plugin loaded! Click the button at the top to test.');
  }
})();

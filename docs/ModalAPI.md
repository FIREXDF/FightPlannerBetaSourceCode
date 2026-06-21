# FightPlanner Modal Manager API

The `window.modalManager` object provides a globally accessible API for opening and managing UI modals within the FightPlanner renderer process. This is especially useful for custom JS scripts and plugins intended to show users information, warnings, or interactive dialogues.

## Accessing the API

The Modal Manager singleton is accessible anywhere in the renderer via:

```javascript
const modalManager = window.modalManager;
```

---

## 1. Creating Custom Modals (`showCustomModal`)

This is the primary method for plugins to create generic, custom-built modals dynamically without needing to write predefined HTML in the main application.

### Signature
```typescript
modalManager.showCustomModal(options: CustomModalOptions): HTMLElement
```

### Options Interface
```typescript
interface CustomModalOptions {
  id?: string;
  title: string;
  body: string | HTMLElement;
  size?: 'normal' | 'large' | 'small' | 'fullscreen' | string;
  buttons?: CustomModalButton[];
  onClose?: () => void;
  escapeToClose?: boolean;
  clickOverlayToClose?: boolean;
}

interface CustomModalButton {
  text: string;
  type?: string;
  id?: string;
  onClick?: (e: MouseEvent, modal: HTMLElement) => void | boolean | Promise<void>;
  closeOnClick?: boolean;
}
```

### Example Usage

```javascript
window.modalManager.showCustomModal({
  title: 'My Plugin Settings',
  body: '<p>Customize your plugin preferences below:</p><input type="checkbox" id="my-setting"> Enable Feature',
  size: 'normal',
  buttons: [
    {
      text: 'Save',
      type: 'primary',
      onClick: async (e, modalElement) => {
        const isChecked = modalElement.querySelector('#my-setting').checked;
        await myPlugin.saveSettings(isChecked);
        window.toastManager?.success('Settings saved!');
      }
    },
    {
      text: 'Cancel',
      type: 'secondary'
    }
  ]
});
```

---

## 2. Showing Simple Alerts (`showAlert`)

If you just need to show a simple notification dialog (success, error, or warning), use `showAlert`.

### Signature
```typescript
modalManager.showAlert(type: 'success' | 'error' | 'warning' | 'info', title: string, message: string, params?: object)
```

### Example Usage
```javascript
window.modalManager.showAlert(
  'warning', 
  'Operation Failed', 
  'Could not connect to the remote server. Please try again later.'
);
```

---

## 3. General Methods

### `closeModal(modalIdOrElement, options)`
Closes a modal by its ID string or its HTMLElement reference.

```javascript
window.modalManager.closeModal('my-custom-modal-id', {
  onModalClosed: () => console.log('Modal finished animating and closed')
});
```

### `showOverlay()` / `hideOverlay()`
Manually manage the darkened background overlay behind modals. This is generally handled automatically by the Modal Manager.

```javascript
window.modalManager.showOverlay();
window.modalManager.hideOverlay();
```

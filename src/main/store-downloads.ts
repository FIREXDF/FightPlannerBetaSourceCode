import Store from 'electron-store';

const downloadsStore = new Store({
    name: 'mod-downloads',
});

export default downloadsStore;

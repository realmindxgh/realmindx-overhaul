import { resolveConfig } from 'vite';
console.log('before resolve');
const c=await resolveConfig({ root: '.', configFile: false, logLevel: 'info', clearScreen: false }, 'build');
console.log('after resolve', c.root);


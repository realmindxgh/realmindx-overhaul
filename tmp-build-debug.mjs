process.env.DEBUG='vite:*';
import { build } from 'vite';
console.log('before build');
await build({ root: '.', logLevel: 'info', clearScreen: false });
console.log('after build');


const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/main.js'],
  bundle: true,
  outfile: 'dist/bundle.js',
  format: 'iife',
  minify: false,
  sourcemap: true,
}).then(() => {
  console.log('Build succeeded.');
}).catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});

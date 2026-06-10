import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';
import fs from 'fs';

const css = fs.readFileSync('src/style.css', 'utf8');

postcss([tailwindcss, autoprefixer])
  .process(css, { from: 'src/style.css', to: 'dist/style.css' })
  .then(result => {
    console.log('PostCSS compiled successfully!');
    console.log('Output length:', result.css.length);
    
    // Check for specific classes
    const classesToCheck = ['.btn ', '.btn-primary', '.gap-3', '.max-w-6xl', '.glass-panel', '.flex-wrap', '.px-4', '.py-3', '.mx-auto'];
    classesToCheck.forEach(cls => {
      const found = result.css.includes(cls);
      console.log(`Class ${cls}: ${found ? 'FOUND' : 'NOT FOUND'}`);
    });
  })
  .catch(err => {
    console.error('PostCSS compilation failed:', err);
  });

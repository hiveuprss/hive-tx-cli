import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findPackageJson(): string {
  // Try relative paths from current file
  const paths = [
    join(__dirname, '../package.json'),     // From dist/
    join(__dirname, '../../package.json'),   // From src/
    join(process.cwd(), 'package.json'),     // From cwd
  ];
  
  for (const path of paths) {
    if (existsSync(path)) {
      return path;
    }
  }
  
  throw new Error('Could not find package.json');
}

export const packageJson = JSON.parse(
  readFileSync(findPackageJson(), 'utf-8')
);

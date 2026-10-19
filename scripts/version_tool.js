const fs = require('fs');
const path = require('path');

const packageJsonPath = path.resolve(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const action = process.argv[2];
const newVerArg = process.argv[3];

if (action === 'get') {
  console.log(pkg.version);
  process.exit(0);
}

if (action === 'next-patch') {
  const parts = pkg.version.split('.').map(Number);
  if (parts.length === 3 && !parts.some(isNaN)) {
    parts[2] += 1;
    console.log(parts.join('.'));
  } else {
    console.log(pkg.version);
  }
  process.exit(0);
}

if (action === 'set' && newVerArg) {
  const oldVer = pkg.version;
  pkg.version = newVerArg.trim();
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`[Version] Updated ${oldVer} -> ${pkg.version}`);
  process.exit(0);
}

console.log(pkg.version);

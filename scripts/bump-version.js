const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const type = process.argv[2]; 
const custom = process.argv[3];

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const baseVersion = pkg.version.split('-')[0];

let nextVersion = '';

if (type === 'custom' && custom) {
    nextVersion = custom;
} else if (type === 'alpha' || type === 'beta') {
    try {
        const tags = execSync('git tag -l', { encoding: 'utf8' })
            .split('\n')
            .filter(t => t.includes(`-${type}`));
        
        let maxNum = 0;
        tags.forEach(tag => {
            const match = tag.match(new RegExp(`-${type}(\\d+)$`));
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxNum) maxNum = num;
            }
        });
        
        nextVersion = `${baseVersion}-${type}${maxNum + 1}`;
    } catch (e) {
        nextVersion = `${baseVersion}-${type}1`;
    }
} else {
    process.exit(0);
}

if (nextVersion) {
    pkg.version = nextVersion;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(nextVersion);
}

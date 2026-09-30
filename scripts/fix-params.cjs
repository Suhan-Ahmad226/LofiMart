const fs = require('fs');
const path = require('path');

function updateParams(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      updateParams(fullPath);
    } else if (file === 'route.ts') {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // Check if file already has Promise in params type
      if (/params:\s*\{ params:\s*Promise</.test(content)) {
        console.log('Already updated:', fullPath);
        continue;
      }
      
      // Replace old params signature with new one
      // Old: { params }: { params: { id: string } })
      // New: { params }: { params: Promise<{ id: string }> })
      const newContent = content.replace(
        /\{ params \}:\s*\{ params:\s*\{ ([a-zA-Z]+): string \} \}/g,
        '{ params }: { params: Promise<{ $1: string }> }'
      );
      
      if (content !== newContent) {
        fs.writeFileSync(fullPath, newContent);
        console.log('Updated:', fullPath);
      }
    }
  }
}

updateParams('src/app/api');
console.log('Done');

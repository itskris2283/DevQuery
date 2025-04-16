/**
 * Script to fix TypeScript linter errors in server files
 */
const fs = require('fs');
const path = require('path');

// Files that need to be processed
const filesToFix = [
  'server/database.ts',
  'server/mongo-storage.ts',
  'server/safeMockMode.ts',
  'server/storage.ts'
];

// Read each file, fix the issues, and write it back
for (const filePath of filesToFix) {
  console.log(`Processing ${filePath}...`);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Fix 1: Remove jwt import if present
  content = content.replace(/import\s+jwt\s+from\s+['"]jsonwebtoken['"];?/g, '');
  
  // Fix 2: Add type annotations to map callbacks for questions
  content = content.replace(
    /questions\.map\(async\s+\(question\)\s+=>/g, 
    'questions.map(async (question: IQuestion) =>'
  );
  
  // Fix 3: Add type annotations to map callbacks for answers
  content = content.replace(
    /answers\.map\(async\s+\(answer\)\s+=>/g, 
    'answers.map(async (answer: IAnswer) =>'
  );
  
  // Fix 4: Fix express-session import
  content = content.replace(
    /import\s+session\s+from\s+['"]express-session['"];/g,
    'import * as sessionModule from \'express-session\';\nconst session = sessionModule.default || sessionModule;'
  );
  
  // Fix 5: Fix memorystore import
  content = content.replace(
    /import\s+createMemoryStore\s+from\s+['"]memorystore['"];/g,
    'import * as createMemoryStoreModule from \'memorystore\';\nconst createMemoryStore = createMemoryStoreModule.default || createMemoryStoreModule;'
  );
  
  // Write the fixed content back
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Fixed ${filePath}`);
}

// Create types directory if it doesn't exist
const typesDir = path.join(__dirname, 'server', 'types');
if (!fs.existsSync(typesDir)) {
  fs.mkdirSync(typesDir, { recursive: true });
  console.log('Created server/types directory');
}

console.log('All files processed successfully'); 
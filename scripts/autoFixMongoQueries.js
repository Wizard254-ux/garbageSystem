const fs = require('fs');
const path = require('path');

/**
 * Auto-fix MongoDB queries to Sequelize across the project
 * This script will find and replace common MongoDB patterns
 */

// List of files to process (add more as needed)
const filesToProcess = [
  './controllers/paymentController.js',
  './controllers/mpesaController.js', 
  './routes/authRoutes.js',
  './routes/bags.js',
  './routes/payment.js',
  './routes/invoices.js'
];

// Common replacement patterns
const replacementPatterns = [
  // findById -> findByPk
  {
    from: /\.findById\(/g,
    to: '.findByPk('
  },
  // findByIdAndUpdate -> update pattern
  {
    from: /await\s+(\w+)\.findByIdAndUpdate\(\s*([^,]+),\s*([^,]+),?\s*[^)]*\)/g,
    to: 'await $1.update($3, { where: { id: $2 } }); const updated = await $1.findByPk($2)'
  },
  // findByIdAndDelete -> destroy
  {
    from: /\.findByIdAndDelete\(/g,
    to: '.destroy({ where: { id: '
  },
  // find({ -> findAll({ where: {
  {
    from: /\.find\(\{/g,
    to: '.findAll({ where: {'
  },
  // findOne({ -> findOne({ where: {
  {
    from: /\.findOne\(\{([^}]+)\}/g,
    to: '.findOne({ where: {$1}'
  },
  // countDocuments -> count
  {
    from: /\.countDocuments\(/g,
    to: '.count({ where: '
  },
  // .select('-password') -> attributes: { exclude: ['password'] }
  {
    from: /\.select\('-password'\)/g,
    to: ', { attributes: { exclude: [\'password\'] } }'
  },
  // .populate -> include (basic pattern)
  {
    from: /\.populate\('([^']+)',\s*'([^']+)'\)/g,
    to: ', { include: [{ model: $1Model, as: \'$1\', attributes: [\'$2\'] }] }'
  },
  // req.user._id -> req.user.id
  {
    from: /req\.user\._id/g,
    to: 'req.user.id'
  },
  // user._id -> user.id
  {
    from: /(\w+)\._id(?!\w)/g,
    to: '$1.id'
  },
  // MongoDB operators to Sequelize
  {
    from: /\$or:/g,
    to: '[Op.or]:'
  },
  {
    from: /\$in:/g,
    to: '[Op.in]:'
  },
  {
    from: /\$gte:/g,
    to: '[Op.gte]:'
  },
  {
    from: /\$lte:/g,
    to: '[Op.lte]:'
  },
  {
    from: /\$ne:/g,
    to: '[Op.ne]:'
  },
  {
    from: /\$exists:\s*true/g,
    to: '[Op.ne]: null'
  },
  {
    from: /\$exists:\s*false/g,
    to: '[Op.eq]: null'
  }
];

function processFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${filePath}`);
      return;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;
    let changesCount = 0;

    // Apply each replacement pattern
    replacementPatterns.forEach(pattern => {
      const newContent = content.replace(pattern.from, pattern.to);
      if (newContent !== content) {
        changesCount++;
        content = newContent;
      }
    });

    // Add Op import if MongoDB operators were replaced and not already imported
    if (content.includes('[Op.') && !content.includes('const { Op }') && !content.includes(', Op }')) {
      // Find the sequelize import line and add Op
      content = content.replace(
        /const \{ ([^}]+) \} = require\('sequelize'\);/,
        'const { $1, Op } = require(\'sequelize\');'
      );
      // If no sequelize import found, add one at the top
      if (!content.includes('require(\'sequelize\')')) {
        content = 'const { Op } = require(\'sequelize\');\n' + content;
      }
    }

    // Only write if changes were made
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Fixed ${changesCount} patterns in ${filePath}`);
    } else {
      console.log(`ℹ️  No changes needed in ${filePath}`);
    }

  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

function autoFixMongoQueries() {
  console.log('🔄 Starting auto-fix of MongoDB queries...');
  
  filesToProcess.forEach(file => {
    const fullPath = path.resolve(file);
    console.log(`\n🔍 Processing: ${file}`);
    processFile(fullPath);
  });
  
  console.log('\n🎉 Auto-fix completed!');
  console.log('\n⚠️  Please review the changes and test thoroughly.');
  console.log('💡 Some complex patterns may need manual adjustment.');
}

// Run if this script is executed directly
if (require.main === module) {
  autoFixMongoQueries();
}

module.exports = { autoFixMongoQueries, processFile };
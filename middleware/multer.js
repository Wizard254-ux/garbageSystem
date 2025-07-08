// middleware/upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const createUploadDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = 'uploads/';
    
    // Different folders for different file types
    if (file.fieldname === 'profile') {
      uploadPath = 'uploads/profiles/';
    } else if (file.fieldname === 'documents') {
      uploadPath = 'uploads/documents/';
    } else {
      uploadPath = 'uploads/general/';
    }
    
    createUploadDir(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp-random-originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const filename = file.fieldname + '-' + uniqueSuffix + extension;
    cb(null, filename);
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  // Define allowed file types
  const allowedTypes = {
    profile: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'],
    documents: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  };
  
  const fieldAllowedTypes = allowedTypes[file.fieldname] || allowedTypes.documents;
  
  if (fieldAllowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type for ${file.fieldname}. Allowed types: ${fieldAllowedTypes.join(', ')}`), false);
  }
};

// Create multer instance
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 10 // Maximum 10 files
  },
  fileFilter: fileFilter
});

// Middleware functions
const uploadSingle = (fieldname) => {
  return (req, res, next) => {
    upload.single(fieldname)(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: 'File upload error',
          error: err.message
        });
      }
      
      // Add file path to request if file was uploaded
      if (req.file) {
        req.filePath = req.file.path;
        req.fileUrl = `/${req.file.path}`; // For serving files
      }
      
      next();
    });
  };
};

const uploadMultiple = (fieldname, maxCount = 5) => {
  return (req, res, next) => {
    upload.array(fieldname, maxCount)(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: 'File upload error',
          error: err.message
        });
      }
      
      // Add file paths to request if files were uploaded
      if (req.files && req.files.length > 0) {
        req.filePaths = req.files.map(file => file.path);
        req.fileUrls = req.files.map(file => `/${file.path}`);
      }
      
      next();
    });
  };
};

// Mixed upload (different field names)
const uploadMixed = upload.fields([
  { name: 'profile', maxCount: 1 },
  { name: 'documents', maxCount: 5 }
]);

const uploadMixedMiddleware = (req, res, next) => {
  uploadMixed(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: 'File upload error',
        error: err.message
      });
    }
    
    // Organize uploaded files
    if (req.files) {
      if (req.files.profile) {
        req.profilePath = req.files.profile[0].path;
        req.profileUrl = `/${req.files.profile[0].path}`;
      }
      
      if (req.files.documents) {
        req.documentPaths = req.files.documents.map(file => file.path);
        req.documentUrls = req.files.documents.map(file => `/${file.path}`);
      }
    }
    
    next();
  });
};

module.exports = {
  uploadSingle,
  uploadMultiple,
  uploadMixedMiddleware
};

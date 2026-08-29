/**
 * Storage Manager (Local Disk vs Cloudflare R2 / AWS S3)
 *
 * If R2_BUCKET_NAME is set, it will upload files directly to Cloudflare R2 (or AWS S3).
 * If R2_BUCKET_NAME is NOT set, it falls back to local disk storage (./public/uploads).
 *
 * Usage:
 *   const { upload } = require('./storage');
 *   app.post('/upload', upload.single('image'), (req, res) => ...);
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const isR2Enabled = !!process.env.R2_BUCKET_NAME;

let uploadMiddleware;

if (isR2Enabled) {
  console.log('[Storage] R2_BUCKET_NAME detected — using Cloudflare R2 / S3 for uploads');
  
  const { S3Client } = require('@aws-sdk/client-s3');
  const multerS3 = require('multer-s3');

  // For Cloudflare R2, endpoint looks like: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
  // For AWS S3, it can be omitted or set to the region URL.
  const s3Client = new S3Client({
    region: process.env.R2_REGION || 'auto',
    endpoint: process.env.R2_ENDPOINT, // e.g., https://<ACCOUNT_ID>.r2.cloudflarestorage.com
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    }
  });

  const fileFilter = (req, file, cb) => {
    const isImage = file.mimetype.startsWith('image/');
    const isVideo = file.mimetype.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogg)$/i.test(file.originalname);
    if (isImage || isVideo) {
      cb(null, true);
    } else {
      cb(new Error('Desteklenmeyen dosya formatı. Sadece görsel ve video yüklenebilir.'), false);
    }
  };

  uploadMiddleware = multer({
    storage: multerS3({
      s3: s3Client,
      bucket: process.env.R2_BUCKET_NAME,
      acl: 'public-read',
      contentType: multerS3.AUTO_CONTENT_TYPE,
      metadata: function (req, file, cb) {
        cb(null, { fieldName: file.fieldname });
      },
      key: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        // Save in R2 with the 'uploads/' prefix so URLs match local fallback
        cb(null, `uploads/${uniqueSuffix}${ext}`);
      }
    }),
    fileFilter,
    limits: { fileSize: 35 * 1024 * 1024 } // 35MB limit
  });

} else {
  console.log('[Storage] R2_BUCKET_NAME not set — using local disk fallback');

  const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  const diskStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  });

  const fileFilter = (req, file, cb) => {
    const isImage = file.mimetype.startsWith('image/');
    const isVideo = file.mimetype.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogg)$/i.test(file.originalname);
    if (isImage || isVideo) {
      cb(null, true);
    } else {
      cb(new Error('Desteklenmeyen dosya formatı. Sadece görsel ve video yüklenebilir.'), false);
    }
  };

  uploadMiddleware = multer({
    storage: diskStorage,
    fileFilter,
    limits: { fileSize: 35 * 1024 * 1024 } // 35MB limit
  });
}

/**
 * Normalizer function to get a consistent URL format regardless of storage engine.
 * 
 * When using local disk, Multer sets `req.file.filename`.
 * When using R2, MulterS3 sets `req.file.key` and `req.file.location`.
 * 
 * Note: If using R2 without a custom domain, `location` might be long. 
 * Usually, you map a public custom domain (e.g., cdn.blunk.com) to R2.
 */
function getFileUrl(reqFile) {
  if (!reqFile) return null;
  
  if (isR2Enabled) {
    // If you have a custom domain for R2, you could return: `https://cdn.blunk.com/${reqFile.key}`
    // For now, return the absolute URL provided by S3/R2 or build it manually
    return process.env.R2_PUBLIC_URL 
      ? `${process.env.R2_PUBLIC_URL}/${reqFile.key}` 
      : `/${reqFile.key}`; // Fallback to relative if mounted
  } else {
    return `/uploads/${reqFile.filename}`;
  }
}

module.exports = {
  upload: uploadMiddleware,
  getFileUrl,
  isR2Enabled
};

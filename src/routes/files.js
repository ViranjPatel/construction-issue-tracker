const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { Client } = require('minio');
const { query, auditLog } = require('../utils/db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// MinIO client (optional)
let minioClient = null;
const useMinIO = process.env.MINIO_ENDPOINT;

if (useMinIO) {
  minioClient = new Client({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT) || 9000,
    useSSL: false,
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
  });

  // Create bucket if not exists
  minioClient.bucketExists('construction-files').then(exists => {
    if (!exists) {
      minioClient.makeBucket('construction-files');
    }
  }).catch(console.error);
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 10 // Max 10 files per request
  },
  fileFilter: (req, file, cb) => {
    // Allow images, documents, and common construction file types
    const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx|dwg|dxf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Upload files to issue
router.post('/upload/:issueId', auth, upload.array('files', 10), async (req, res) => {
  try {
    const { issueId } = req.params;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Verify issue exists and user has access
    const issueResult = await query(`
      SELECT i.*, pm.user_id 
      FROM issues i
      LEFT JOIN projects p ON i.project_id = p.id
      LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = $1
      WHERE i.id = $2 AND (pm.user_id IS NOT NULL OR $3 = 'admin')
    `, [req.user.id, issueId, req.user.role]);

    if (issueResult.rows.length === 0) {
      // Clean up uploaded files
      await Promise.all(req.files.map(file => fs.unlink(file.path).catch(() => {})));
      return res.status(404).json({ error: 'Issue not found or access denied' });
    }

    const uploadedFiles = [];

    for (const file of req.files) {
      try {
        let storagePath = file.path;

        // Upload to MinIO if configured
        if (minioClient) {
          const objectName = `issues/${issueId}/${file.filename}`;
          await minioClient.fPutObject('construction-files', objectName, file.path);
          storagePath = `minio://construction-files/${objectName}`;
          
          // Remove local file after MinIO upload
          await fs.unlink(file.path).catch(() => {});
        }

        // Save to database
        const result = await query(`
          INSERT INTO attachments (
            issue_id, filename, original_name, mime_type, 
            size_bytes, storage_path, uploaded_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `, [
          issueId,
          file.filename,
          file.originalname,
          file.mimetype,
          file.size,
          storagePath,
          req.user.id
        ]);

        uploadedFiles.push(result.rows[0]);

        // Audit log
        await auditLog('attachment', result.rows[0].id, 'uploaded', null, result.rows[0], req.user.id, req);

      } catch (err) {
        console.error('File upload error:', err);
        // Clean up on error
        await fs.unlink(file.path).catch(() => {});
      }
    }

    // Real-time notification
    global.broadcast(issueResult.rows[0].project_id, {
      type: 'files_uploaded',
      issueId,
      files: uploadedFiles
    });

    res.json({
      message: `${uploadedFiles.length} file(s) uploaded successfully`,
      files: uploadedFiles
    });

  } catch (err) {
    console.error('Upload error:', err);
    // Clean up files on error
    if (req.files) {
      await Promise.all(req.files.map(file => fs.unlink(file.path).catch(() => {})));
    }
    res.status(500).json({ error: 'File upload failed' });
  }
});

// Download file
router.get('/download/:fileId', auth, async (req, res) => {
  try {
    const { fileId } = req.params;

    // Get file info and check access
    const result = await query(`
      SELECT a.*, pm.user_id
      FROM attachments a
      LEFT JOIN issues i ON a.issue_id = i.id
      LEFT JOIN projects p ON i.project_id = p.id
      LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = $1
      WHERE a.id = $2 AND (pm.user_id IS NOT NULL OR $3 = 'admin')
    `, [req.user.id, fileId, req.user.role]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }

    const file = result.rows[0];

    if (file.storage_path.startsWith('minio://')) {
      // Download from MinIO
      const objectName = file.storage_path.replace('minio://construction-files/', '');
      const stream = await minioClient.getObject('construction-files', objectName);
      
      res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
      res.setHeader('Content-Type', file.mime_type);
      stream.pipe(res);
    } else {
      // Download from local storage
      const filePath = path.resolve(file.storage_path);
      
      try {
        await fs.access(filePath);
        res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
        res.setHeader('Content-Type', file.mime_type);
        res.sendFile(filePath);
      } catch (err) {
        res.status(404).json({ error: 'File not found on disk' });
      }
    }

    // Audit log
    await auditLog('attachment', fileId, 'downloaded', null, null, req.user.id, req);

  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'File download failed' });
  }
});

// Delete file
router.delete('/:fileId', auth, async (req, res) => {
  try {
    const { fileId } = req.params;

    // Get file info and check permissions
    const result = await query(`
      SELECT a.*, i.project_id, pm.user_id, pm.role as project_role
      FROM attachments a
      LEFT JOIN issues i ON a.issue_id = i.id
      LEFT JOIN projects p ON i.project_id = p.id
      LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = $1
      WHERE a.id = $2 AND (
        a.uploaded_by = $1 OR 
        pm.role IN ('admin', 'supervisor') OR 
        $3 = 'admin'
      )
    `, [req.user.id, fileId, req.user.role]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }

    const file = result.rows[0];

    // Delete from storage
    if (file.storage_path.startsWith('minio://')) {
      const objectName = file.storage_path.replace('minio://construction-files/', '');
      await minioClient.removeObject('construction-files', objectName);
    } else {
      await fs.unlink(file.storage_path).catch(() => {});
    }

    // Delete from database
    await query('DELETE FROM attachments WHERE id = $1', [fileId]);

    // Audit log
    await auditLog('attachment', fileId, 'deleted', file, null, req.user.id, req);

    // Real-time notification
    global.broadcast(file.project_id, {
      type: 'file_deleted',
      fileId,
      issueId: file.issue_id
    });

    res.json({ message: 'File deleted successfully' });

  } catch (err) {
    console.error('Delete file error:', err);
    res.status(500).json({ error: 'File deletion failed' });
  }
});

// Get file info
router.get('/:fileId/info', auth, async (req, res) => {
  try {
    const { fileId } = req.params;

    const result = await query(`
      SELECT a.*, u.name as uploaded_by_name, pm.user_id
      FROM attachments a
      LEFT JOIN users u ON a.uploaded_by = u.id
      LEFT JOIN issues i ON a.issue_id = i.id
      LEFT JOIN projects p ON i.project_id = p.id
      LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = $1
      WHERE a.id = $2 AND (pm.user_id IS NOT NULL OR $3 = 'admin')
    `, [req.user.id, fileId, req.user.role]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error('Get file info error:', err);
    res.status(500).json({ error: 'Failed to fetch file info' });
  }
});

module.exports = router;
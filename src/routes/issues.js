const express = require('express');
const { query, auditLog, cache } = require('../utils/db');
const auth = require('../middleware/auth');

const router = express.Router();

// Get issues with filtering and pagination
router.get('/', auth, async (req, res) => {
  try {
    const { 
      project_id, 
      status, 
      category, 
      assigned_to, 
      page = 1, 
      limit = 20,
      search 
    } = req.query;

    const offset = (page - 1) * limit;
    const cacheKey = `issues:${JSON.stringify(req.query)}`;
    
    // Try cache first
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (project_id) {
      whereClause += ` AND i.project_id = $${paramIndex++}`;
      params.push(project_id);
    }
    if (status) {
      whereClause += ` AND i.status = $${paramIndex++}`;
      params.push(status);
    }
    if (category) {
      whereClause += ` AND i.category = $${paramIndex++}`;
      params.push(category);
    }
    if (assigned_to) {
      whereClause += ` AND i.assigned_to = $${paramIndex++}`;
      params.push(assigned_to);
    }
    if (search) {
      whereClause += ` AND (i.title ILIKE $${paramIndex++} OR i.description ILIKE $${paramIndex++})`;
      params.push(`%${search}%`, `%${search}%`);
    }

    const result = await query(`
      SELECT 
        i.*,
        p.name as project_name,
        r.name as reported_by_name,
        a.name as assigned_to_name,
        COUNT(*) OVER() as total_count
      FROM issues i
      LEFT JOIN projects p ON i.project_id = p.id
      LEFT JOIN users r ON i.reported_by = r.id
      LEFT JOIN users a ON i.assigned_to = a.id
      ${whereClause}
      ORDER BY i.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, limit, offset]);

    const response = {
      issues: result.rows,
      total: result.rows[0]?.total_count || 0,
      page: parseInt(page),
      pages: Math.ceil((result.rows[0]?.total_count || 0) / limit)
    };

    // Cache for 1 minute
    await cache.set(cacheKey, response, 60);
    
    res.json(response);
  } catch (err) {
    console.error('Get issues error:', err);
    res.status(500).json({ error: 'Failed to fetch issues' });
  }
});

// Get single issue
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(`
      SELECT 
        i.*,
        p.name as project_name,
        r.name as reported_by_name,
        a.name as assigned_to_name,
        json_agg(
          json_build_object(
            'id', att.id,
            'filename', att.filename,
            'original_name', att.original_name,
            'size_bytes', att.size_bytes,
            'created_at', att.created_at
          )
        ) FILTER (WHERE att.id IS NOT NULL) as attachments
      FROM issues i
      LEFT JOIN projects p ON i.project_id = p.id
      LEFT JOIN users r ON i.reported_by = r.id
      LEFT JOIN users a ON i.assigned_to = a.id
      LEFT JOIN attachments att ON i.id = att.issue_id
      WHERE i.id = $1
      GROUP BY i.id, p.name, r.name, a.name
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get issue error:', err);
    res.status(500).json({ error: 'Failed to fetch issue' });
  }
});

// Create issue
router.post('/', auth, async (req, res) => {
  try {
    const {
      project_id,
      title,
      description,
      category,
      priority = 'medium',
      location,
      assigned_to,
      due_date
    } = req.body;

    const result = await query(`
      INSERT INTO issues (
        project_id, title, description, category, priority, 
        location, assigned_to, reported_by, due_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      project_id, title, description, category, priority,
      location ? JSON.stringify(location) : null,
      assigned_to, req.user.id, due_date
    ]);

    const issue = result.rows[0];

    // Audit log
    await auditLog('issue', issue.id, 'created', null, issue, req.user.id, req);

    // Real-time notification
    global.broadcast(project_id, {
      type: 'issue_created',
      issue: issue
    });

    // Clear relevant caches
    await cache.del(`issues:*`);

    res.status(201).json(issue);
  } catch (err) {
    console.error('Create issue error:', err);
    res.status(500).json({ error: 'Failed to create issue' });
  }
});

// Update issue
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = req.body;

    // Get current issue for audit
    const currentResult = await query('SELECT * FROM issues WHERE id = $1', [id]);
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    const currentIssue = currentResult.rows[0];

    // Build update query dynamically
    const fields = Object.keys(updateFields).filter(field => 
      ['title', 'description', 'category', 'priority', 'status', 'assigned_to', 'due_date', 'location'].includes(field)
    );

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const values = fields.map(field => 
      field === 'location' && updateFields[field] ? JSON.stringify(updateFields[field]) : updateFields[field]
    );

    const result = await query(`
      UPDATE issues SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${fields.length + 1}
      RETURNING *
    `, [...values, id]);

    const updatedIssue = result.rows[0];

    // Auto-resolve timestamp
    if (updateFields.status === 'resolved' && !currentIssue.resolved_at) {
      await query('UPDATE issues SET resolved_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
      updatedIssue.resolved_at = new Date();
    }

    // Audit log
    await auditLog('issue', id, 'updated', currentIssue, updatedIssue, req.user.id, req);

    // Real-time notification
    global.broadcast(currentIssue.project_id, {
      type: 'issue_updated',
      issue: updatedIssue
    });

    // Clear caches
    await cache.del(`issues:*`);

    res.json(updatedIssue);
  } catch (err) {
    console.error('Update issue error:', err);
    res.status(500).json({ error: 'Failed to update issue' });
  }
});

// Delete issue
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query('DELETE FROM issues WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    const deletedIssue = result.rows[0];

    // Audit log
    await auditLog('issue', id, 'deleted', deletedIssue, null, req.user.id, req);

    // Real-time notification
    global.broadcast(deletedIssue.project_id, {
      type: 'issue_deleted',
      issueId: id
    });

    // Clear caches
    await cache.del(`issues:*`);

    res.json({ message: 'Issue deleted successfully' });
  } catch (err) {
    console.error('Delete issue error:', err);
    res.status(500).json({ error: 'Failed to delete issue' });
  }
});

// Get issue statistics
router.get('/:projectId/stats', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const cacheKey = `issue_stats:${projectId}`;
    
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const result = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'open') as open,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
        COUNT(*) FILTER (WHERE priority = 'critical') as critical,
        COUNT(*) FILTER (WHERE due_date < CURRENT_TIMESTAMP AND status NOT IN ('resolved', 'closed')) as overdue
      FROM issues 
      WHERE project_id = $1
    `, [projectId]);

    const stats = result.rows[0];

    // Cache for 5 minutes
    await cache.set(cacheKey, stats, 300);

    res.json(stats);
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

module.exports = router;
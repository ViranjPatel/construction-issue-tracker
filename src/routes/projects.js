const express = require('express');
const { query, auditLog, cache } = require('../utils/db');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// Get projects
router.get('/', auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (status) {
      whereClause += ` AND p.status = $${paramIndex++}`;
      params.push(status);
    }

    // Non-admin users only see projects they're members of
    if (req.user.role !== 'admin') {
      whereClause += ` AND pm.user_id = $${paramIndex++}`;
      params.push(req.user.id);
    }

    const result = await query(`
      SELECT 
        p.*,
        u.name as created_by_name,
        COUNT(i.*) as total_issues,
        COUNT(i.*) FILTER (WHERE i.status = 'open') as open_issues,
        COUNT(*) OVER() as total_count
      FROM projects p
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN project_members pm ON p.id = pm.project_id
      LEFT JOIN issues i ON p.id = i.project_id
      ${whereClause}
      GROUP BY p.id, u.name
      ORDER BY p.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, limit, offset]);

    res.json({
      projects: result.rows,
      total: result.rows[0]?.total_count || 0,
      page: parseInt(page),
      pages: Math.ceil((result.rows[0]?.total_count || 0) / limit)
    });
  } catch (err) {
    console.error('Get projects error:', err);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get single project
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT 
        p.*,
        u.name as created_by_name,
        json_agg(
          json_build_object(
            'user_id', pm.user_id,
            'name', um.name,
            'email', um.email,
            'role', pm.role
          )
        ) FILTER (WHERE pm.user_id IS NOT NULL) as members
      FROM projects p
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN project_members pm ON p.id = pm.project_id
      LEFT JOIN users um ON pm.user_id = um.id
      WHERE p.id = $1
      GROUP BY p.id, u.name
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = result.rows[0];

    // Check if user has access
    if (req.user.role !== 'admin') {
      const hasAccess = project.members?.some(m => m.user_id === req.user.id);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    res.json(project);
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// Create project
router.post('/', auth, authorize(['admin', 'supervisor']), async (req, res) => {
  try {
    const { name, description, location, start_date, end_date } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Project name required' });
    }

    const result = await query(`
      INSERT INTO projects (name, description, location, start_date, end_date, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      name,
      description,
      location ? JSON.stringify(location) : null,
      start_date,
      end_date,
      req.user.id
    ]);

    const project = result.rows[0];

    // Add creator as admin member
    await query(`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES ($1, $2, 'admin')
    `, [project.id, req.user.id]);

    // Audit log
    await auditLog('project', project.id, 'created', null, project, req.user.id, req);

    res.status(201).json(project);
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Update project
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = req.body;

    // Check if user can update (admin or project admin)
    if (req.user.role !== 'admin') {
      const memberCheck = await query(`
        SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2
      `, [id, req.user.id]);

      if (memberCheck.rows.length === 0 || memberCheck.rows[0].role !== 'admin') {
        return res.status(403).json({ error: 'Only project admins can update projects' });
      }
    }

    // Get current project for audit
    const currentResult = await query('SELECT * FROM projects WHERE id = $1', [id]);
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const fields = Object.keys(updateFields).filter(field => 
      ['name', 'description', 'location', 'status', 'start_date', 'end_date'].includes(field)
    );

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const values = fields.map(field => 
      field === 'location' && updateFields[field] ? JSON.stringify(updateFields[field]) : updateFields[field]
    );

    const result = await query(`
      UPDATE projects SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${fields.length + 1}
      RETURNING *
    `, [...values, id]);

    // Audit log
    await auditLog('project', id, 'updated', currentResult.rows[0], result.rows[0], req.user.id, req);

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Add project member
router.post('/:id/members', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, role = 'worker' } = req.body;

    // Check permissions
    if (req.user.role !== 'admin') {
      const memberCheck = await query(`
        SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2
      `, [id, req.user.id]);

      if (memberCheck.rows.length === 0 || memberCheck.rows[0].role !== 'admin') {
        return res.status(403).json({ error: 'Only project admins can add members' });
      }
    }

    // Check if user exists
    const userExists = await query('SELECT id, name, email FROM users WHERE id = $1', [user_id]);
    if (userExists.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Add member
    await query(`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (project_id, user_id) 
      DO UPDATE SET role = EXCLUDED.role, joined_at = CURRENT_TIMESTAMP
    `, [id, user_id, role]);

    // Audit log
    await auditLog('project_member', id, 'added', null, { user_id, role }, req.user.id, req);

    res.json({ message: 'Member added successfully' });
  } catch (err) {
    console.error('Add member error:', err);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// Remove project member
router.delete('/:id/members/:userId', auth, async (req, res) => {
  try {
    const { id, userId } = req.params;

    // Check permissions
    if (req.user.role !== 'admin') {
      const memberCheck = await query(`
        SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2
      `, [id, req.user.id]);

      if (memberCheck.rows.length === 0 || memberCheck.rows[0].role !== 'admin') {
        return res.status(403).json({ error: 'Only project admins can remove members' });
      }
    }

    const result = await query(`
      DELETE FROM project_members 
      WHERE project_id = $1 AND user_id = $2
      RETURNING *
    `, [id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Audit log
    await auditLog('project_member', id, 'removed', result.rows[0], null, req.user.id, req);

    res.json({ message: 'Member removed successfully' });
  } catch (err) {
    console.error('Remove member error:', err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

module.exports = router;
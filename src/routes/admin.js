const express = require('express');
const { query, cache } = require('../utils/db');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// Get audit logs (admin only)
router.get('/audit', auth, authorize(['admin']), async (req, res) => {
  try {
    const { 
      entity_type, 
      entity_id, 
      action, 
      user_id,
      page = 1, 
      limit = 50 
    } = req.query;

    const offset = (page - 1) * limit;
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (entity_type) {
      whereClause += ` AND al.entity_type = $${paramIndex++}`;
      params.push(entity_type);
    }
    if (entity_id) {
      whereClause += ` AND al.entity_id = $${paramIndex++}`;
      params.push(entity_id);
    }
    if (action) {
      whereClause += ` AND al.action = $${paramIndex++}`;
      params.push(action);
    }
    if (user_id) {
      whereClause += ` AND al.user_id = $${paramIndex++}`;
      params.push(user_id);
    }

    const result = await query(`
      SELECT 
        al.*,
        u.name as user_name,
        u.email as user_email,
        COUNT(*) OVER() as total_count
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ${whereClause}
      ORDER BY al.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, limit, offset]);

    res.json({
      logs: result.rows,
      total: result.rows[0]?.total_count || 0,
      page: parseInt(page),
      pages: Math.ceil((result.rows[0]?.total_count || 0) / limit)
    });
  } catch (err) {
    console.error('Get audit logs error:', err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// System statistics (admin only)
router.get('/stats', auth, authorize(['admin']), async (req, res) => {
  try {
    const cacheKey = 'system_stats';
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const [usersResult, projectsResult, issuesResult, auditResult] = await Promise.all([
      query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM users'),
      query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = \'active\') as active FROM projects'),
      query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'open') as open,
          COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
          COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
          COUNT(*) FILTER (WHERE priority = 'critical') as critical,
          COUNT(*) FILTER (WHERE created_at > CURRENT_DATE - INTERVAL '7 days') as this_week
        FROM issues
      `),
      query('SELECT COUNT(*) as total FROM audit_logs WHERE created_at > CURRENT_DATE - INTERVAL \'24 hours\'')
    ]);

    const stats = {
      users: usersResult.rows[0],
      projects: projectsResult.rows[0],
      issues: issuesResult.rows[0],
      audit: auditResult.rows[0],
      generated_at: new Date().toISOString()
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, stats, 300);

    res.json(stats);
  } catch (err) {
    console.error('Get system stats error:', err);
    res.status(500).json({ error: 'Failed to fetch system statistics' });
  }
});

// Health check with detailed status
router.get('/health', async (req, res) => {
  try {
    const checks = {
      timestamp: new Date().toISOString(),
      status: 'ok',
      services: {}
    };

    // Database check
    try {
      await query('SELECT 1');
      checks.services.database = { status: 'ok', latency: 'low' };
    } catch (err) {
      checks.services.database = { status: 'error', error: err.message };
      checks.status = 'error';
    }

    // Redis check
    try {
      await cache.set('health_check', 'ok', 10);
      await cache.get('health_check');
      checks.services.redis = { status: 'ok', latency: 'low' };
    } catch (err) {
      checks.services.redis = { status: 'error', error: err.message };
      checks.status = 'degraded';
    }

    // Memory usage
    const memUsage = process.memoryUsage();
    checks.memory = {
      rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB'
    };

    // Uptime
    checks.uptime = Math.floor(process.uptime()) + 's';

    const statusCode = checks.status === 'ok' ? 200 : checks.status === 'degraded' ? 206 : 503;
    res.status(statusCode).json(checks);
  } catch (err) {
    res.status(503).json({
      status: 'error',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Database metrics (admin only)
router.get('/db-metrics', auth, authorize(['admin']), async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        schemaname,
        tablename,
        n_tup_ins as inserts,
        n_tup_upd as updates,
        n_tup_del as deletes,
        n_live_tup as live_tuples,
        n_dead_tup as dead_tuples
      FROM pg_stat_user_tables 
      ORDER BY n_live_tup DESC
    `);

    res.json({
      tables: result.rows,
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Get DB metrics error:', err);
    res.status(500).json({ error: 'Failed to fetch database metrics' });
  }
});

// Clear cache (admin only)
router.post('/clear-cache', auth, authorize(['admin']), async (req, res) => {
  try {
    const { pattern = '*' } = req.body;
    
    // Simple cache clearing - in production you'd want more sophisticated cache management
    await cache.del(pattern);
    
    res.json({ 
      message: 'Cache cleared successfully',
      pattern,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Clear cache error:', err);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// Export data (admin only)
router.get('/export/:entity', auth, authorize(['admin']), async (req, res) => {
  try {
    const { entity } = req.params;
    const { format = 'json' } = req.query;

    let data = [];
    let filename = '';

    switch (entity) {
      case 'issues':
        const issuesResult = await query(`
          SELECT 
            i.*,
            p.name as project_name,
            r.name as reported_by_name,
            a.name as assigned_to_name
          FROM issues i
          LEFT JOIN projects p ON i.project_id = p.id
          LEFT JOIN users r ON i.reported_by = r.id
          LEFT JOIN users a ON i.assigned_to = a.id
          ORDER BY i.created_at DESC
        `);
        data = issuesResult.rows;
        filename = `issues_export_${new Date().toISOString().split('T')[0]}`;
        break;

      case 'users':
        const usersResult = await query(`
          SELECT id, email, name, role, is_active, created_at
          FROM users
          ORDER BY created_at DESC
        `);
        data = usersResult.rows;
        filename = `users_export_${new Date().toISOString().split('T')[0]}`;
        break;

      case 'projects':
        const projectsResult = await query(`
          SELECT p.*, u.name as created_by_name
          FROM projects p
          LEFT JOIN users u ON p.created_by = u.id
          ORDER BY p.created_at DESC
        `);
        data = projectsResult.rows;
        filename = `projects_export_${new Date().toISOString().split('T')[0]}`;
        break;

      default:
        return res.status(400).json({ error: 'Invalid entity type' });
    }

    if (format === 'csv') {
      // Simple CSV generation
      if (data.length === 0) {
        return res.status(404).json({ error: 'No data to export' });
      }

      const headers = Object.keys(data[0]);
      const csvContent = [
        headers.join(','),
        ...data.map(row => 
          headers.map(header => 
            typeof row[header] === 'string' ? `"${row[header].replace(/"/g, '""')}"` : row[header]
          ).join(',')
        )
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.send(csvContent);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
      res.json(data);
    }

  } catch (err) {
    console.error('Export data error:', err);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

module.exports = router;
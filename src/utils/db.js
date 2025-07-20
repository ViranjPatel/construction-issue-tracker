const { Pool } = require('pg');
const redis = require('redis');

// PostgreSQL connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'construction_tracker',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'postgres',
  max: 20, // pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Redis connection
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => {
  console.error('Redis error:', err);
});

redisClient.connect();

// Query with connection pooling
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Query executed:', { text: text.slice(0, 50), duration, rows: res.rowCount });
    return res;
  } catch (err) {
    console.error('Database query error:', err);
    throw err;
  }
};

// Audit logging function
const auditLog = async (entityType, entityId, action, oldValues, newValues, userId, req) => {
  const auditData = {
    entity_type: entityType,
    entity_id: entityId,
    action,
    old_values: oldValues ? JSON.stringify(oldValues) : null,
    new_values: newValues ? JSON.stringify(newValues) : null,
    user_id: userId,
    ip_address: req ? req.ip : null,
    user_agent: req ? req.get('User-Agent') : null
  };

  try {
    await query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, old_values, new_values, user_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      Object.values(auditData)
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
};

// Cache helpers
const cache = {
  get: async (key) => {
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (err) {
      console.error('Cache get error:', err);
      return null;
    }
  },

  set: async (key, value, ttl = 300) => {
    try {
      await redisClient.setEx(key, ttl, JSON.stringify(value));
    } catch (err) {
      console.error('Cache set error:', err);
    }
  },

  del: async (key) => {
    try {
      await redisClient.del(key);
    } catch (err) {
      console.error('Cache delete error:', err);
    }
  }
};

module.exports = {
  query,
  auditLog,
  cache,
  pool,
  redisClient
};
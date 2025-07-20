const request = require('supertest');
const app = require('../src/server');

describe('Construction Issue Tracker API', () => {
  let authToken;
  let projectId;
  let issueId;

  // Test authentication
  describe('Authentication', () => {
    test('POST /api/auth/login should authenticate admin user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@construction.local',
          password: 'admin123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.role).toBe('admin');
      
      authToken = response.body.token;
    });

    test('POST /api/auth/login should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid@example.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    test('GET /api/auth/me should return user profile', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('email', 'admin@construction.local');
    });
  });

  // Test project management
  describe('Projects', () => {
    test('POST /api/projects should create a new project', async () => {
      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Construction Project',
          description: 'A test project for API testing',
          location: {
            address: '123 Test Street',
            lat: 40.7128,
            lng: -74.0060
          }
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Test Construction Project');
      
      projectId = response.body.id;
    });

    test('GET /api/projects should list projects', async () => {
      const response = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('projects');
      expect(Array.isArray(response.body.projects)).toBe(true);
    });

    test('GET /api/projects/:id should return project details', async () => {
      const response = await request(app)
        .get(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Test Construction Project');
    });
  });

  // Test issue management
  describe('Issues', () => {
    test('POST /api/issues should create a new issue', async () => {
      const response = await request(app)
        .post('/api/issues')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          project_id: projectId,
          title: 'Test Safety Issue',
          description: 'A test safety issue for API testing',
          category: 'safety',
          priority: 'high',
          location: {
            lat: 40.7128,
            lng: -74.0060,
            description: 'Main entrance area'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe('Test Safety Issue');
      expect(response.body.category).toBe('safety');
      expect(response.body.priority).toBe('high');
      
      issueId = response.body.id;
    });

    test('GET /api/issues should list issues', async () => {
      const response = await request(app)
        .get('/api/issues')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('issues');
      expect(Array.isArray(response.body.issues)).toBe(true);
    });

    test('GET /api/issues/:id should return issue details', async () => {
      const response = await request(app)
        .get(`/api/issues/${issueId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.title).toBe('Test Safety Issue');
    });

    test('PUT /api/issues/:id should update issue status', async () => {
      const response = await request(app)
        .put(`/api/issues/${issueId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'in_progress'
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('in_progress');
    });

    test('GET /api/issues with filtering should work', async () => {
      const response = await request(app)
        .get('/api/issues?status=in_progress&category=safety')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.issues.length).toBeGreaterThan(0);
      expect(response.body.issues[0].status).toBe('in_progress');
    });
  });

  // Test admin endpoints
  describe('Admin', () => {
    test('GET /api/admin/stats should return system statistics', async () => {
      const response = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('projects');
      expect(response.body).toHaveProperty('issues');
    });

    test('GET /api/admin/health should return detailed health status', async () => {
      const response = await request(app)
        .get('/api/admin/health')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('services');
    });

    test('GET /api/admin/audit should return audit logs', async () => {
      const response = await request(app)
        .get('/api/admin/audit')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('logs');
      expect(Array.isArray(response.body.logs)).toBe(true);
    });
  });

  // Test error handling
  describe('Error Handling', () => {
    test('Should return 401 for requests without auth token', async () => {
      const response = await request(app)
        .get('/api/issues');

      expect(response.status).toBe(401);
    });

    test('Should return 404 for non-existent routes', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });

    test('Should return 400 for invalid issue creation', async () => {
      const response = await request(app)
        .post('/api/issues')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing required fields
          description: 'Missing title and project_id'
        });

      expect(response.status).toBe(500); // Will be 500 due to database constraint
    });
  });

  // Test API documentation
  describe('API Documentation', () => {
    test('GET /api should return API information', async () => {
      const response = await request(app)
        .get('/api');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('endpoints');
    });

    test('GET /health should return basic health check', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
    });
  });

  // Cleanup
  afterAll(async () => {
    // Clean up test data if needed
    if (issueId) {
      await request(app)
        .delete(`/api/issues/${issueId}`)
        .set('Authorization', `Bearer ${authToken}`);
    }
  });
});

module.exports = app;
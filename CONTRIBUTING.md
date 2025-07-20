# Contributing to Construction Issue Tracker

Thank you for your interest in contributing to the Construction Issue Tracker! This project aims to provide a lightweight, efficient, and reliable issue management system for construction teams.

## 🎯 Project Vision

Building the **simplest, fastest, most reliable** construction issue tracking system possible, optimized for:
- **Performance** - Sub-100ms response times
- **Simplicity** - Single-command deployment
- **Reliability** - Complete audit trails and data integrity
- **Accessibility** - Works on any device, even with poor connectivity

## 🚀 Quick Start for Contributors

```bash
# Clone and setup
git clone https://github.com/ViranjPatel/construction-issue-tracker.git
cd construction-issue-tracker

# Quick development setup
make quick-start

# Or manual setup
make setup
make dev
```

## 🛠️ Development Workflow

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local development)
- Git

### Development Commands
```bash
make dev          # Start development environment
make test         # Run tests
make logs         # View logs
make shell-app    # Access app container
make health       # Check application health
```

## 🧪 Testing

We maintain high test coverage to ensure reliability:

```bash
make test              # Run all tests
make test-watch        # Run tests in watch mode
make test-coverage     # Generate coverage report
```

### Test Structure
- **API Tests** - `/tests/api.test.js` - Complete API functionality
- **Unit Tests** - Individual component testing
- **Integration Tests** - End-to-end workflows

## 📝 Code Style

### Architecture Principles
1. **Ultra-lightweight** - Minimal dependencies, maximum performance
2. **Security-first** - Complete audit trails, proper authentication
3. **Mobile-ready** - API designed for offline-capable mobile apps
4. **Self-contained** - No external dependencies for core functionality

### Code Guidelines
- **Concise variables** - `i`, `j` for indices, `e` for events
- **Performance-focused** - Connection pooling, caching, optimized queries
- **Error handling** - Always handle errors gracefully
- **Audit everything** - Log all significant actions

### File Structure
```
src/
├── routes/         # API endpoints (auth, issues, projects, files, admin)
├── middleware/     # Authentication, validation
├── utils/          # Database helpers, utilities
└── server.js       # Main application entry
```

## 🔄 Pull Request Process

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Write tests** for your changes
4. **Ensure tests pass**: `make test`
5. **Commit** with descriptive messages
6. **Push** to your fork: `git push origin feature/amazing-feature`
7. **Create** a Pull Request

### Commit Message Format
Use descriptive commits with emojis:
```
🎯 Add issue filtering by GPS location
🔧 Optimize database queries for large datasets
🐛 Fix WebSocket connection handling
📚 Update API documentation
```

## 🎯 Contribution Areas

### High Priority
- **Mobile app** development (React Native)
- **Performance optimizations** (database, caching, queries)
- **Advanced reporting** features
- **Integration APIs** (ERP systems, existing tools)

### Medium Priority
- **Email notifications** system
- **Advanced file preview** (CAD files, blueprints)
- **Time tracking** functionality
- **Multi-language** support

### Always Welcome
- **Documentation** improvements
- **Bug fixes** and performance improvements
- **Test coverage** improvements
- **Security** enhancements

## 🔧 Technical Contributions

### Database Changes
- Update `db/init.sql` for schema changes
- Add migration scripts if needed
- Test with existing data

### API Changes
- Update tests in `/tests/api.test.js`
- Maintain backward compatibility
- Document breaking changes

### Frontend Changes
- Keep the interface lightweight and responsive
- Test on mobile devices
- Maintain accessibility standards

## 🐛 Bug Reports

When reporting bugs, please include:

1. **Environment details** (Docker version, OS, browser)
2. **Steps to reproduce** the issue
3. **Expected vs actual behavior**
4. **Logs** from `make logs`
5. **Screenshots** if applicable

Use our bug report template in GitHub Issues.

## 💡 Feature Requests

Before requesting features:

1. **Check existing issues** for similar requests
2. **Consider the architecture principles** - will this keep the system lightweight?
3. **Provide use cases** - how does this help construction teams?
4. **Think about implementation** - can this be done simply?

## 📊 Performance Standards

All contributions should maintain:
- **API response times** < 100ms for cached queries
- **Database queries** < 50ms average
- **Memory usage** < 512MB for typical workloads
- **Docker image size** < 200MB

## 🔒 Security Guidelines

- **Never log sensitive data** (passwords, tokens)
- **Always validate input** at API boundaries
- **Use parameterized queries** to prevent SQL injection
- **Audit significant actions** using the audit log system
- **Follow JWT best practices** for authentication

## 📚 Documentation

Help us maintain excellent documentation:
- **README updates** for new features
- **API documentation** for new endpoints
- **Code comments** for complex logic
- **Deployment guides** for different environments

## 🌟 Recognition

Contributors are recognized in our:
- **README contributors section**
- **Release notes** for significant contributions
- **GitHub repository** insights

## 🤝 Code of Conduct

We're building software to help construction teams work better together. Please:
- **Be respectful** and inclusive
- **Focus on technical merit** in discussions
- **Help newcomers** get started
- **Assume good intentions**

## 📞 Getting Help

- **GitHub Issues** - Technical questions and bug reports
- **GitHub Discussions** - General questions and ideas
- **Documentation** - Check README and code comments first

## 🚀 Release Process

1. Features are merged to `main`
2. Version bumps follow semantic versioning
3. Releases include Docker images and release notes
4. Production deployments are tested in staging first

---

**Thank you for helping make construction project management more efficient! 🏗️**
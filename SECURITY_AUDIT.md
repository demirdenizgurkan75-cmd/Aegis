# Aegis Bot - Security Audit Report

## Overview
This document summarizes the security enhancements implemented in the Aegis Bot web server and dashboard.

## Security Headers (webServer.js)

### Added HTTP Security Headers
- **X-Content-Type-Options: nosniff** - Prevents MIME type sniffing
- **X-Frame-Options: DENY** - Prevents clickjacking attacks
- **X-XSS-Protection: 1; mode=block** - Legacy XSS protection for older browsers
- **Referrer-Policy: strict-origin-when-cross-origin** - Controls referrer information
- **Content-Security-Policy: default-src 'self'** - Restricts resource loading
- **Strict-Transport-Security: max-age=31536000; includeSubDomains** - Enforces HTTPS

## Rate Limiting (webServer.js)

### In-Memory Rate Limiter
- **Limit**: 100 requests per minute per IP
- **Window**: 60 seconds
- **Headers**: 
  - `X-RateLimit-Limit`: Maximum requests allowed
  - `X-RateLimit-Remaining`: Remaining requests in window
  - `Retry-After`: Seconds until reset (on 429)
- **Cleanup**: Periodic cleanup of expired entries (every 5 minutes)

## Input Validation & Sanitization (helpers.js)

### Sanitization Functions
- **sanitizeInput(input, maxLength)** - Removes HTML tags, trims, limits length
- **sanitizeObject(obj, maxLength)** - Recursively sanitizes objects/arrays/strings
- **Applied to**: All POST/PATCH request bodies in dashboard routes

### CSRF Protection (helpers.js)
- **Token generation**: `generateCsrfToken(sessionId)` - 32-byte secure random tokens
- **Token validation**: `validateCsrfToken(token, sessionId)` - Verifies token ownership and expiry
- **Expiry**: 1 hour
- **Storage**: In-memory Map with automatic cleanup (every 10 minutes)

## File Upload Security (uploads.js)

### Restrictions
- **Allowed extensions**: .png, .jpg, .jpeg, .gif, .webp, .svg
- **Max file size**: 5MB
- **Filename generation**: Cryptographically secure random (16 bytes hex)
- **Content-Type validation**: Must be multipart/form-data
- **Boundary parsing**: Validates boundary exists

## Route-Level Security

### Authentication & Authorization
- **Token verification**: All dashboard routes verify session tokens
- **Permission checks**: Verify user has ManageGuild permission or is server owner
- **Guild membership verification**: Fetches member if not in cache

### Sanitized Endpoints
| Endpoint | Method | Sanitized |
|----------|--------|-----------|
| /api/dashboard/:guildId/settings | POST | ✅ |
| /api/dashboard/:guildId/ticket/ai/settings | POST | ✅ |
| /api/dashboard/:guildId/ticket/ai/skills | POST | ✅ |
| /api/dashboard/:guildId/ticket/ai/skills/:skillId | PATCH | ✅ |
| /api/dashboard/:guildId/voice | POST | ✅ |
| /api/upload | POST | ✅ (file validation) |

### Health, Dependency, Exploit Scanners
- All GET endpoints are read-only
- POST scan endpoints trigger background scans (no user input)
- Finding report endpoints only return pre-generated content

## Token Security (helpers.js)

### Session Tokens
- **Algorithm**: HMAC-SHA256
- **Encoding**: Base64URL
- **Expiry**: Configurable via payload `exp` field
- **Timing-safe comparison**: Uses `crypto.timingSafeEqual()`

## CORS Configuration (webServer.js)

### Allowed Origins
- Production: `https://aegis.site`, `https://www.aegis.site`
- Development: `http://localhost:3000`, `http://localhost:5173`, `http://localhost:8080`
- Credentials: Enabled for session cookies

## Database Security

### Query Safety
- Uses parameterized queries via better-sqlite3
- No dynamic SQL construction with user input
- Input sanitization before database operations

## Known Limitations / Future Improvements

1. **Rate limiting**: In-memory only (resets on restart). Consider Redis for production clusters.
2. **CSRF tokens**: Not yet enforced on all state-changing endpoints. Need middleware integration.
3. **CSP**: Current policy is restrictive (`default-src 'self'`). May need adjustment for external resources.
4. **HSTS**: Only effective with valid TLS certificate. Ensure production uses HTTPS.
5. **Audit logging**: Consider adding security event logging (failed auth, rate limit hits, etc.)

## Verification Checklist

- [x] Security headers on all responses
- [x] Rate limiting on all API endpoints
- [x] Input sanitization on all POST/PATCH bodies
- [x] File upload validation (type, size, name)
- [x] Session token timing-safe verification
- [x] CORS restricted to known origins
- [x] Authorization checks on all dashboard routes
- [x] No SQL injection vulnerabilities (parameterized queries)
- [x] No XSS in JSON responses (Content-Type: application/json)

## Testing Recommendations

1. **Penetration testing**: Test OWASP Top 10 against web endpoints
2. **Rate limit testing**: Verify 429 responses with Retry-After header
3. **File upload testing**: Attempt malicious file uploads
4. **Auth bypass testing**: Test endpoints without valid tokens
5. **CSRF testing**: Attempt cross-site requests
6. **Input validation**: Test XSS payloads in all input fields
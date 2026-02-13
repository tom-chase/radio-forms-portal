# Frontend Tests

This directory contains standalone HTML test files for validating frontend functionality.

## Test Files

### token-expiration.html
Tests the `TokenService` class token validation logic:
- No token scenarios
- Invalid tokens  
- Expired tokens
- Valid tokens

### error-discrimination.html
Tests error classification logic to distinguish between:
- Token expiration errors (triggers login)
- Permission denied errors (shows error message)
- Other errors (normal handling)

## Running Tests

Simply open the HTML files in a web browser:
```bash
# Serve the files locally (optional)
python3 -m http.server 8080
# Then visit http://localhost:8080/tests/frontend/

# Or open directly:
open tests/frontend/token-expiration.html
open tests/frontend/error-discrimination.html
```

## Adding New Tests

When creating new frontend test files:
1. Use descriptive names with hyphens
2. Include comprehensive test cases
3. Provide clear pass/fail indicators
4. Add explanations of what's being tested
5. Update this README

## Integration with CI

These tests are currently manual/browser-based. For future CI integration, consider:
- Converting to a proper test framework (Jest, Vitest, etc.)
- Adding automated browser testing (Playwright, Cypress)
- Including in deployment pipelines

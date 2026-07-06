// tests/validation.test.js — Input validation middleware unit tests
const { validateRegister, validateLogin } = require('../middleware/validationMiddleware');

// Helper: run express-validator rules against a mock request
const runValidation = async (rules, body) => {
  const errors = [];
  const req    = { body };
  const res    = { status: () => res, json: (data) => { errors.push(data); return res; } };
  let passed   = false;
  const next   = () => { passed = true; };

  // Run each rule middleware
  for (const rule of rules.slice(0, -1)) {
    if (rule && typeof rule.run === 'function') {
      await rule.run(req);
    }
  }
  // Run the validate middleware (last item)
  const validateFn = rules[rules.length - 1];
  validateFn(req, res, next);

  return { passed, errors };
};

describe('validateRegister middleware', () => {
  it('passes valid student registration data', async () => {
    const { passed } = await runValidation(validateRegister, {
      fullName:        'John Doe',
      email:           'john@example.com',
      password:        'Password1',
      confirmPassword: 'Password1',
      role:            'student',
    });
    expect(passed).toBe(true);
  });

  it('fails when fullName is missing', async () => {
    const { passed } = await runValidation(validateRegister, {
      email:           'john@example.com',
      password:        'Password1',
      confirmPassword: 'Password1',
      role:            'student',
    });
    expect(passed).toBe(false);
  });

  it('fails when email is invalid', async () => {
    const { passed } = await runValidation(validateRegister, {
      fullName:        'John Doe',
      email:           'not-an-email',
      password:        'Password1',
      confirmPassword: 'Password1',
      role:            'student',
    });
    expect(passed).toBe(false);
  });

  it('fails when password is too short', async () => {
    const { passed } = await runValidation(validateRegister, {
      fullName:        'John Doe',
      email:           'john@example.com',
      password:        'abc',
      confirmPassword: 'abc',
      role:            'student',
    });
    expect(passed).toBe(false);
  });

  it('fails when passwords do not match', async () => {
    const { passed } = await runValidation(validateRegister, {
      fullName:        'John Doe',
      email:           'john@example.com',
      password:        'Password1',
      confirmPassword: 'Different1',
      role:            'student',
    });
    expect(passed).toBe(false);
  });

  it('fails when role is admin', async () => {
    const { passed } = await runValidation(validateRegister, {
      fullName:        'John Doe',
      email:           'john@example.com',
      password:        'Password1',
      confirmPassword: 'Password1',
      role:            'admin',
    });
    expect(passed).toBe(false);
  });
});

describe('validateLogin middleware', () => {
  it('passes valid login data', async () => {
    const { passed } = await runValidation(validateLogin, {
      email:    'john@example.com',
      password: 'Password1',
      role:     'student',
    });
    expect(passed).toBe(true);
  });

  it('fails when email is missing', async () => {
    const { passed } = await runValidation(validateLogin, {
      password: 'Password1',
      role:     'student',
    });
    expect(passed).toBe(false);
  });

  it('fails when password is missing', async () => {
    const { passed } = await runValidation(validateLogin, {
      email: 'john@example.com',
      role:  'student',
    });
    expect(passed).toBe(false);
  });

  it('fails with invalid role', async () => {
    const { passed } = await runValidation(validateLogin, {
      email:    'john@example.com',
      password: 'Password1',
      role:     'superuser',
    });
    expect(passed).toBe(false);
  });
});

const MAX_RECURSION_DEPTH = 20;

function validateDepth(value, depth = 0) {
  if (depth > MAX_RECURSION_DEPTH) {
    const err = new Error(`Object nesting exceeds maximum depth of ${MAX_RECURSION_DEPTH}`);
    err.code = 'BAD_INPUT';
    throw err;
  }
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value) validateDepth(item, depth + 1);
  } else if (typeof value === 'object') {
    for (const key of Object.keys(value)) {
      validateDepth(value[key], depth + 1);
    }
  }
}

function validateEmail(email) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateUrl(url) {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export { validateDepth, validateEmail, validateUrl };

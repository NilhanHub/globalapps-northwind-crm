import { hashPassword } from '../apps/api/src/auth/auth-service.js';

const password = process.env.CRM_PASSWORD_PLAINTEXT ?? '';
if (!password)
  throw new Error('Set CRM_PASSWORD_PLAINTEXT for this command only. The plaintext value is never printed or written.');
console.log(await hashPassword(password));

import fs from 'node:fs';
import path from 'node:path';

function createSessionStore(dataDir) {
  const file = path.join(dataDir, '.crm-sessions.json');
  const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

  function load() {
    try {
      if (!fs.existsSync(file)) return {};
      const raw = fs.readFileSync(file, 'utf8');
      const data = JSON.parse(raw);
      if (typeof data !== 'object' || data === null) return {};
      const now = Date.now();
      const valid = {};
      for (const [token, session] of Object.entries(data)) {
        if (now - session.createdAt <= SESSION_TTL_MS) {
          valid[token] = session;
        }
      }
      return valid;
    } catch {
      return {};
    }
  }

  function save(sessions) {
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(temp, JSON.stringify(sessions), 'utf8');
    fs.renameSync(temp, file);
  }

  return { load, save };
}

export { createSessionStore };

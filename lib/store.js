const fs = require('node:fs');
const path = require('node:path');

function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, file);
}

function createStores(dataDir) {
  const files = {
    companies: path.join(dataDir, 'companies.json'),
    people: path.join(dataDir, 'people.json'),
    routes: path.join(dataDir, 'routes.json'),
    activities: path.join(dataDir, 'activities.json'),
  };
  const transactionFile = path.join(dataDir, '.crm-transaction.json');

  function load(name) {
    const file = files[name];
    if (!file) throw new Error(`Unknown CRM store: ${name}`);
    if (!fs.existsSync(file)) {
      atomicWrite(file, []);
      return [];
    }
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(value)) throw new Error(`${path.basename(file)} must contain a JSON array`);
    return value;
  }

  const save = (name, value) => {
    if (!files[name] || !Array.isArray(value)) throw new Error(`Invalid CRM store: ${name}`);
    atomicWrite(files[name], value);
  };

  function transaction(changes) {
    const entries = Object.entries(changes);
    for (const [name, value] of entries) {
      if (!files[name] || !Array.isArray(value)) throw new Error(`Invalid transaction store: ${name}`);
    }
    const before = Object.fromEntries(entries.map(([name]) => [name, load(name)]));
    atomicWrite(transactionFile, {
      id: `transaction-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(), before, after: changes,
    });
    try {
      for (const [name, value] of entries) atomicWrite(files[name], value);
      fs.rmSync(transactionFile, { force: true });
    } catch (error) {
      for (const [name, value] of Object.entries(before)) atomicWrite(files[name], value);
      fs.rmSync(transactionFile, { force: true });
      throw error;
    }
  }

  function recover() {
    if (!fs.existsSync(transactionFile)) return;
    const journal = JSON.parse(fs.readFileSync(transactionFile, 'utf8'));
    if (!journal || !journal.after || typeof journal.after !== 'object') throw new Error('Invalid CRM transaction journal');
    for (const [name, value] of Object.entries(journal.after)) {
      if (!files[name] || !Array.isArray(value)) throw new Error(`Invalid transaction journal store: ${name}`);
      atomicWrite(files[name], value);
    }
    fs.rmSync(transactionFile, { force: true });
  }

  return { load, save, transaction, recover };
}

module.exports = { createStores };

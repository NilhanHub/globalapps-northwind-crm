import 'dotenv/config';
import { getHostingerBackupStatus } from '../apps/api/src/services/hostinger-backup.js';

const directory = process.env.CRM_HOSTINGER_BACKUP_DIR?.trim();
if (!directory) throw new Error('CRM_HOSTINGER_BACKUP_DIR is required');
console.log(JSON.stringify(getHostingerBackupStatus(directory), null, 2));

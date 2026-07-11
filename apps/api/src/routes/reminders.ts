import type { FastifyInstance } from 'fastify';
import { deriveRouteReminders } from '@northwind/domain';
import type { CrmRepository } from '../repositories/repository.js';

export function registerReminderRoutes(app: FastifyInstance, repository: CrmRepository) {
  app.get('/api/reminders', async (request) => {
    const workspaceId = request.requestContext!.workspaceId;
    const [routes, activities, settings] = await Promise.all([
      repository.list('routes', workspaceId),
      repository.list('activities', workspaceId),
      repository.list('settings', workspaceId),
    ]);
    return {
      timezone: 'Europe/London',
      items: deriveRouteReminders({ routes, activities, ...(settings[0] ? { settings: settings[0] } : {}) }),
    };
  });
}

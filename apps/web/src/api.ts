import { createApiClient } from '@northwind/api-client';

let csrfToken = '';
let unauthorizedHandler = () => {};

export const api = createApiClient({
  getCsrfToken: () => csrfToken,
  onUnauthorized: () => unauthorizedHandler(),
});

export const setCsrfToken = (token: string) => {
  csrfToken = token;
};
export const onUnauthorized = (handler: () => void) => {
  unauthorizedHandler = handler;
};

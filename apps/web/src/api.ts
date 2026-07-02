import { createApiClient } from '@northwind/api-client';

let csrfToken = '';
let unauthorizedHandler: (code: string) => void = () => undefined;

export const api = createApiClient({
  getCsrfToken: () => csrfToken,
  onUnauthorized: (code) => unauthorizedHandler(code),
});

export const setCsrfToken = (token: string) => {
  csrfToken = token;
};
export const onUnauthorized = (handler: (code: string) => void) => {
  unauthorizedHandler = handler;
};

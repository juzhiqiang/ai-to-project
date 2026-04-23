export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
}

export interface HelloResponse {
  message: string;
}

export const CONSTANTS = {
  API_PREFIX: '/api',
};

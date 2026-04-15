import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Default to dev auth mode in unit tests; individual tests can override with vi.stubEnv.
vi.stubEnv('VITE_AUTH_MODE', 'dev');

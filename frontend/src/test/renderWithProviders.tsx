import type { ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

interface Options extends Omit<RenderOptions, 'wrapper'> {
  client?: QueryClient;
}

export function renderWithProviders(ui: ReactNode, options: Options = {}) {
  const client =
    options.client ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false },
      },
    });
  return {
    client,
    ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>, options),
  };
}

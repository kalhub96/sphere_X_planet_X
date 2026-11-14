'use client';

import React, { useState } from 'react';

type QueryClientProviderComponent = React.ComponentType<{
  client: any;
  children: React.ReactNode;
}>;

let QueryClient: any = null;
let QueryClientProvider: QueryClientProviderComponent = ({ children }) => (
  <>{children}</>
);

try {
  const reactQuery = require('@tanstack/react-query');
  QueryClient = reactQuery.QueryClient;
  QueryClientProvider = reactQuery.QueryClientProvider;
} catch {
  QueryClient = null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      QueryClient
        ? new QueryClient({
            defaultOptions: {
              queries: {
                staleTime: 5 * 60 * 1000,
                refetchOnWindowFocus: false,
                retry: 1,
              },
            },
          })
        : null
  );

  if (!QueryClient || !queryClient) {
    return <>{children}</>;
  }

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

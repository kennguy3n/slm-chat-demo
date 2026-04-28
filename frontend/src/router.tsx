import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { AppShell } from './app/AppShell';
import { useWorkspaceStore } from './stores/workspaceStore';

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    const ctx = useWorkspaceStore.getState().context;
    throw redirect({ to: ctx === 'b2c' ? '/b2c' : '/b2b' });
  },
});

const b2cRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/b2c',
  beforeLoad: () => {
    if (useWorkspaceStore.getState().context !== 'b2c') {
      useWorkspaceStore.getState().setContext('b2c');
    }
  },
  component: () => <AppShell />,
});

const b2bRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/b2b',
  beforeLoad: () => {
    if (useWorkspaceStore.getState().context !== 'b2b') {
      useWorkspaceStore.getState().setContext('b2b');
    }
  },
  component: () => <AppShell />,
});

const routeTree = rootRoute.addChildren([indexRoute, b2cRoute, b2bRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

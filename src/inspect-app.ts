import { createApp } from './api/server.ts';
const app = createApp();
const routes = app._router.stack
  .filter((layer: any) => layer.route)
  .map((layer: any) => ({ path: layer.route.path, methods: layer.route.methods }));
console.log(routes);

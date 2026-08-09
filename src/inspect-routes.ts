import router from './api/routes/all-routes.ts';
console.log('route count', router.stack.length);
console.log(router.stack.map((layer: any) => ({ path: layer.route?.path, methods: layer.route?.methods })));

import { createRouter, createWebHashHistory } from 'vue-router';
import Dashboard from '../views/Dashboard.vue';

// Dashboard is eager (first paint); everything else is lazy-loaded so the
// initial bundle stays small.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: Dashboard },
    { path: '/tanks', component: () => import('../views/TankList.vue') },
    { path: '/tanks/:id', component: () => import('../views/TankDetail.vue'), props: true },
    { path: '/compare', component: () => import('../views/TankCompare.vue') },
    { path: '/analytics', component: () => import('../views/Analytics.vue') },
    { path: '/coach', component: () => import('../views/Coach.vue') },
    { path: '/news', component: () => import('../views/News.vue') },
    { path: '/patches', component: () => import('../views/Patches.vue') },
    { path: '/tutorials', component: () => import('../views/Tutorials.vue') },
    { path: '/settings', component: () => import('../views/Settings.vue') },
    { path: '/:pathMatch(.*)*', component: () => import('../views/NotFound.vue') },
  ],
});

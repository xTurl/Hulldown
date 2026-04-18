import { createRouter, createWebHashHistory } from 'vue-router';
import Dashboard from '../views/Dashboard.vue';
import TankList from '../views/TankList.vue';
import TankDetail from '../views/TankDetail.vue';
import TankCompare from '../views/TankCompare.vue';
import News from '../views/News.vue';
import Patches from '../views/Patches.vue';
import Tutorials from '../views/Tutorials.vue';
import Settings from '../views/Settings.vue';
import Analytics from '../views/Analytics.vue';
import Coach from '../views/Coach.vue';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: Dashboard },
    { path: '/tanks', component: TankList },
    { path: '/tanks/:id', component: TankDetail, props: true },
    { path: '/compare', component: TankCompare },
    { path: '/analytics', component: Analytics },
    { path: '/coach', component: Coach },
    { path: '/news', component: News },
    { path: '/patches', component: Patches },
    { path: '/tutorials', component: Tutorials },
    { path: '/settings', component: Settings },
  ],
});

import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import LoginView from '../views/LoginView.vue'
import OperaView from '../views/OperaView.vue'
import ProfileView from '../views/ProfileView.vue'
import StageView from '../views/StageView.vue'
import TicketView from '../views/TicketView.vue'
import WikiGraphView from '../views/WikiGraphView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: {
        title: '戏曲',
      },
    },
    {
      path: '/opera',
      name: 'opera',
      component: OperaView,
      meta: {
        title: '戏单 - 戏曲',
      },
    },
    {
      path: '/ticket',
      name: 'ticket',
      component: TicketView,
      meta: {
        title: '票务 - 戏曲',
      },
    },
    {
      path: '/stage',
      name: 'stage',
      component: StageView,
      meta: {
        title: '戏台 - 戏曲',
      },
    },
    {
      path: '/wiki-graph',
      name: 'wiki-graph',
      component: WikiGraphView,
      meta: {
        title: '知识图谱 - 戏曲',
      },
    },
    {
      path: '/profile',
      name: 'profile',
      component: ProfileView,
      meta: {
        title: '我的 - 戏曲',
      },
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: {
        title: '登录 - 戏曲',
        showTabbar: false,
      },
    },
  ],
})

router.beforeEach((to) => {
  document.title = typeof to.meta.title === 'string' ? to.meta.title : '戏曲'
})

export default router

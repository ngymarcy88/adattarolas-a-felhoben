import { createRouter, createWebHistory, type RouterHistory } from 'vue-router';
import HomePage from '../pages/HomePage.vue';
import LoginPage from '../pages/LoginPage.vue';
import AccountPage from '../pages/AccountPage.vue';
import AuthUnavailablePage from '../pages/AuthUnavailablePage.vue';
import { authClient, type AuthClient } from '../api/auth';
import { createSessionGuard, session, type createSessionState } from '../auth/session';

export function createAppRouter(history: RouterHistory, client: AuthClient = authClient, state: ReturnType<typeof createSessionState> = session) {
  const router = createRouter({
    history,
    routes: [
      { path: '/', name: 'home', component: HomePage },
      { path: '/login', name: 'login', component: LoginPage },
      { path: '/app', name: 'account', component: AccountPage, meta: { requiresAuth: true } },
      { path: '/auth-unavailable', name: 'auth-unavailable', component: AuthUnavailablePage },
      { path: '/:pathMatch(.*)*', redirect: { name: 'home' } },
    ],
  });
  router.beforeEach(createSessionGuard(state, (signal) => client.currentUser(signal)));
  return router;
}
// Keep construction out of module imports so the same real routes can be unit
// checked with memory history, without a browser or a persisted auth flag.
export const createBrowserRouter = () => createAppRouter(createWebHistory(import.meta.env.BASE_URL));

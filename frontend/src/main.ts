import { createApp } from 'vue';
import App from './App.vue';
import { createBrowserRouter } from './router';
import './style.css';

createApp(App).use(createBrowserRouter()).mount('#app');

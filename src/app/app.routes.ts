import { Routes } from '@angular/router';
import { Home } from './components/home/home';
import { Chat } from './components/chat/chat';
import { Notfound } from './components/notfound/notfound';

export const routes: Routes = [
  { path: '', redirectTo: 'Home', pathMatch: 'full' },
  { path: "Home", component: Home },
  { path: 'chat', component: Chat },
  { path: "**", component: Notfound },
];

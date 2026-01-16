import { Routes } from '@angular/router';
import { Home } from './components/home/home';
import { Chat } from './components/chat/chat';
import { Notfound } from './components/notfound/notfound';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'Home', redirectTo: '', pathMatch: 'full' },
  { path: 'chat', component: Chat },
  { path: '**', component: Notfound }
];

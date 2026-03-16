import { Routes } from '@angular/router';
import { WebOnlyGuard } from './guards/web-only-guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/home/home').then(m => m.Home),
  },
  {
    path: 'Home',
    redirectTo: '',
    pathMatch: 'full',
  },
  {
    path: 'chat',
    loadComponent: () => import('./components/chat/chat').then(m => m.Chat),
  },
  {
    path: 'videocall',
    loadComponent: () => import('./components/videocall/videocall').then(m => m.Videocall),
  },
  {
    path: 'about',
    loadComponent: () => import('./components/about/about').then(m => m.About),
  },
  {
    path: 'privacy',
    loadComponent: () => import('./components/privacy/privacy').then(m => m.Privacy),
  },
  {
    path: 'App-Download',
    loadComponent: () => import('./components/app-download/app-download').then(m => m.AppDownload),
    canActivate: [WebOnlyGuard],
  },
  {
    path: '**',
    loadComponent: () => import('./components/notfound/notfound').then(m => m.Notfound),
  },
];

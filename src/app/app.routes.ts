import { Routes } from '@angular/router';
import { Home } from './components/home/home';
import { Chat } from './components/chat/chat';
import { Notfound } from './components/notfound/notfound';
import { AppDownload } from './components/app-download/app-download';
import { WebOnlyGuard } from './guards/web-only-guard';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'Home', redirectTo: '', pathMatch: 'full' },
  { path: 'chat', component: Chat },
  { path: 'App-Download', component: AppDownload, canActivate: [WebOnlyGuard] },
  { path: '**', component: Notfound }
];

import { AsyncPipe, CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { RouterLink } from "@angular/router";
import { SocketService } from '../../service/socket-service';
import { Observable, Subscription } from 'rxjs';

@Component({
  selector: 'app-navbar',
  imports: [CommonModule, RouterLink, AsyncPipe],
  templateUrl: './navbar.html',
  styleUrls: ['./navbar.css'],
})
export class Navbar {
  currentLang = localStorage.getItem('lang') || 'en';
  private translate = inject(TranslateService);
  usersInRoom$: Observable<number>;

  constructor(private socketService: SocketService) {
    const darkMode = localStorage.getItem('darkMode');
    if (darkMode === 'true') {
      document.body.classList.add('dark-mode');
    }
    this.usersInRoom$ = this.socketService.usersInRoom$;
  }

  toggleLang() {
    this.currentLang = this.currentLang === 'en' ? 'ar' : 'en';
    localStorage.setItem('lang', this.currentLang);
    this.translate.use(this.currentLang);

    const pageContent = document.querySelector('#page-content');
    if (pageContent) pageContent.setAttribute('dir', this.currentLang === 'ar' ? 'rtl' : 'ltr');

    const pageFooter = document.querySelector('#page-footer');
    if (pageFooter) pageFooter.setAttribute('dir', this.currentLang === 'ar' ? 'rtl' : 'ltr');

    document.documentElement.lang = this.currentLang;
  }

  toggleTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDark ? 'true' : 'false');
  }

  get isDarkMode(): boolean {
    return document.body.classList.contains('dark-mode');
  }
}

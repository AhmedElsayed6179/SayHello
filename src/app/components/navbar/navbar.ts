import { AsyncPipe, CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { RouterLink } from "@angular/router";
import { Observable } from 'rxjs';
import { ChatService } from '../../service/chat-service';

@Component({
  selector: 'app-navbar',
  imports: [CommonModule, RouterLink, AsyncPipe],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar {
  currentLang = localStorage.getItem('lang') || 'en';
  private translate = inject(TranslateService);
  connectedUsers$: Observable<number>;

  constructor(private chatService: ChatService) {
    const darkMode = localStorage.getItem('darkMode');
    if (darkMode === 'true') {
      document.body.classList.add('dark-mode');
    }
    this.connectedUsers$ = this.chatService.connectedUsers$;
  }

  toggleLang() {
    this.currentLang = this.currentLang === 'en' ? 'ar' : 'en';
    localStorage.setItem('lang', this.currentLang);
    this.translate.use(this.currentLang);

    // غير اتجاه المحتوى فقط، Footer يتحرك مع main تلقائي
    const pageContent = document.querySelector('#page-content');
    if (pageContent) {
      pageContent.setAttribute('dir', this.currentLang === 'ar' ? 'rtl' : 'ltr');
    }

    // ممكن تضيف Footer مع main لو حابب
    const pageFooter = document.querySelector('#page-footer');
    if (pageFooter) {
      pageFooter.setAttribute('dir', this.currentLang === 'ar' ? 'rtl' : 'ltr');
    }

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

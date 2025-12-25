import { AsyncPipe, CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, NgZone } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { RouterLink } from "@angular/router";
import { Observable } from 'rxjs';
import { ChatService } from '../../service/chat-service';
import { io, Socket } from 'socket.io-client';

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
  private socket!: Socket;

  constructor(private chatService: ChatService, private zone: NgZone, private cd: ChangeDetectorRef) {
    const darkMode = localStorage.getItem('darkMode');
    if (darkMode === 'true') {
      document.body.classList.add('dark-mode');
    }
    this.connectedUsers$ = this.chatService.connectedUsers$;
  }

  ngOnInit() {
    // فتح Socket لمتابعة عدد المستخدمين فورًا
    this.socket = io('https://sayhelloserver-production.up.railway.app', { transports: ['websocket'] });
    this.socket.on('user_count', (count: number) => this.zone.run(() => {
      this.chatService.connectedUsers$.next(count);
      this.cd.detectChanges();
    }));
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

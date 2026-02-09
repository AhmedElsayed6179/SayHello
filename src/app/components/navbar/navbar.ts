import { AsyncPipe, CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, NgZone, OnInit } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { RouterLink } from "@angular/router";
import { Observable } from 'rxjs';
import { ChatService } from '../../service/chat-service';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment.development';
import { FormsModule } from '@angular/forms';
declare var bootstrap: any;

@Component({
  selector: 'app-navbar',
  imports: [CommonModule, RouterLink, AsyncPipe, FormsModule, TranslatePipe],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar implements OnInit {
  currentLang = localStorage.getItem('lang') || 'en';
  private translate = inject(TranslateService);
  connectedUsers$: Observable<number>;
  private socket!: Socket;
  showDownloadLink = false;

  constructor(private chatService: ChatService, private zone: NgZone, private cd: ChangeDetectorRef) {
    const darkMode = localStorage.getItem('darkMode');
    if (darkMode === 'true') {
      document.body.classList.add('dark-mode');
    }
    this.connectedUsers$ = this.chatService.connectedUsers$;
  }

  ngOnInit() {
    this.socket = io(`${environment.SayHello_Server}`, { transports: ['websocket'] });
    this.socket.on('user_count', (count: number) => this.zone.run(() => {
      this.chatService.connectedUsers$.next(count);
      this.cd.detectChanges();
    }));

    const ua = navigator.userAgent || navigator.vendor || '';

    const isApk =
      /wv/i.test(ua) ||
      /Version\/[\d.]+.*Chrome/i.test(ua) ||
      /Median/i.test(ua) ||
      (window as any).cordova !== undefined ||
      (window as any).Capacitor !== undefined;

    const isMobile = /Android|iPhone|iPad|iPod|IEMobile|BlackBerry|Opera Mini/i.test(ua);

    this.showDownloadLink = isMobile && !isApk;
  }

  changeLang(lang: string) {
    this.currentLang = lang;
    localStorage.setItem('lang', lang);
    this.translate.use(lang);

    const dir = lang === 'ar' ? 'rtl' : 'ltr';

    const pageContent = document.querySelector('#page-content');
    if (pageContent) {
      pageContent.setAttribute('dir', dir);
    }

    const pageFooter = document.querySelector('#page-footer');
    if (pageFooter) {
      pageFooter.setAttribute('dir', dir);
    }

    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
  }

  toggleTheme() {
    const body = document.body;
    const isDark = body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDark ? 'true' : 'false');
  }

  get isDarkMode(): boolean {
    return document.body.classList.contains('dark-mode');
  }

closeNavbar() {
  const navbarCollapse = document.getElementById('navbarContent');
  if (navbarCollapse) {
    const bsCollapse = bootstrap.Collapse.getInstance(navbarCollapse)
                       || new bootstrap.Collapse(navbarCollapse, { toggle: false });
    bsCollapse.hide();
  }
}
}

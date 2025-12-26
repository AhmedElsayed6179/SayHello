import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Navbar } from './components/navbar/navbar';
import { Footer } from './components/footer/footer';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Navbar, Footer],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  protected readonly title = signal('SayHello');
  currentLang = localStorage.getItem('lang') || 'en';
  private translate = inject(TranslateService);
  
  ngOnInit() {
    const lang = localStorage.getItem('lang') || 'en';
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
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
}

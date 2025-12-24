import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-footer',
  imports: [TranslateModule, CommonModule],
  templateUrl: './footer.html',
  styleUrl: './footer.css',
})
export class Footer {
  private translate = inject(TranslateService);

  get isDarkMode(): boolean {
    return document.body.classList.contains('dark-mode');
  }

  // هذا يوضح اتجاه النص
  get currentDir(): 'rtl' | 'ltr' {
    return this.translate.currentLang === 'ar' ? 'rtl' : 'ltr';
  }

  // إذا احتجت اللغة نفسها
  get currentLanguage(): string {
    return this.translate.currentLang;
  }
}

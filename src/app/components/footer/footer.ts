import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-footer',
  imports: [TranslateModule, CommonModule],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
})
export class Footer {
  today = new Date();

  private translate = inject(TranslateService);

  get isDarkMode(): boolean {
    return document.body.classList.contains('dark-mode');
  }

  get currentDir(): 'rtl' | 'ltr' {
    return this.translate.currentLang === 'ar' ? 'rtl' : 'ltr';
  }

  get currentLanguage(): string {
    return this.translate.currentLang;
  }
}

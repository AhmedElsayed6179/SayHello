import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-privacy',
  imports: [TranslatePipe, CommonModule],
  templateUrl: './privacy.html',
  styleUrl: './privacy.scss',
})
export class Privacy {
  constructor(private translate: TranslateService) {}

  summaryItems = [
    {
      icon: 'fas fa-user-secret',
      title: 'PRIVACY.SUM1_TITLE',
      desc: 'PRIVACY.SUM1_DESC',
      bg: 'rgba(79,142,247,0.1)',
      color: '#4f8ef7',
    },
    {
      icon: 'fas fa-database',
      title: 'PRIVACY.SUM2_TITLE',
      desc: 'PRIVACY.SUM2_DESC',
      bg: 'rgba(16,185,129,0.1)',
      color: '#10b981',
    },
    {
      icon: 'fas fa-lock',
      title: 'PRIVACY.SUM3_TITLE',
      desc: 'PRIVACY.SUM3_DESC',
      bg: 'rgba(167,139,250,0.1)',
      color: '#a78bfa',
    },
    {
      icon: 'fas fa-share-alt',
      title: 'PRIVACY.SUM4_TITLE',
      desc: 'PRIVACY.SUM4_DESC',
      bg: 'rgba(6,182,212,0.1)',
      color: '#06b6d4',
    },
  ];

  tocItems = [
    'PRIVACY.TOC1',
    'PRIVACY.TOC2',
    'PRIVACY.TOC3',
    'PRIVACY.TOC4',
    'PRIVACY.TOC5',
    'PRIVACY.TOC6',
    'PRIVACY.TOC7',
  ];

  s2items = [
    'PRIVACY.S2_I1',
    'PRIVACY.S2_I2',
    'PRIVACY.S2_I3',
    'PRIVACY.S2_I4',
  ];

  s4items = [
    'PRIVACY.S4_I1',
    'PRIVACY.S4_I2',
    'PRIVACY.S4_I3',
  ];

  get isDarkMode(): boolean {
    return document.body.classList.contains('dark-mode');
  }

  get currentDir() {
    return this.translate.currentLang === 'ar' ? 'rtl' : 'ltr';
  }

  scrollTo(event: Event, id: string) {
    event.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

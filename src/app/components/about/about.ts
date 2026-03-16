import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-about',
  imports: [TranslatePipe, CommonModule, RouterLink],
  templateUrl: './about.html',
  styleUrl: './about.scss',
})
export class About {
  constructor(private translate: TranslateService) {}

  // ── Hero badges ───────────────────────────────
  heroBadges = [
    { icon: 'fas fa-user-secret', label: 'HOME.TRUST_ANON_TITLE' },
    { icon: 'fas fa-infinity',    label: 'HOME.STAT_FREE' },
    { icon: 'fas fa-globe',       label: 'ABOUT.VAL3_TITLE' },
  ];

  // ── Stats ─────────────────────────────────────
  stats = [
    { value: '10K+', label: 'ABOUT.STAT_USERS' },
    { value: '50+',  label: 'ABOUT.STAT_COUNTRIES' },
    { value: '2024', label: 'ABOUT.STAT_FOUNDED' },
    { value: '100%', label: 'ABOUT.STAT_FREE' },
  ];

  // ── Chat / Video feature lists ────────────────
  chatFeatures  = ['HOME.CHAT_F1', 'HOME.CHAT_F2', 'HOME.CHAT_F3', 'HOME.CHAT_F4'];
  videoFeatures = ['HOME.VIDEO_F1', 'HOME.VIDEO_F2', 'HOME.VIDEO_F3', 'HOME.VIDEO_F4'];

  // ── How it works ──────────────────────────────
  howSteps = [
    { icon: 'fas fa-user-edit', title: 'HOME.STEP1_TITLE', desc: 'HOME.STEP1_DESC' },
    { icon: 'fas fa-random',    title: 'HOME.STEP2_TITLE', desc: 'HOME.STEP2_DESC' },
    { icon: 'fas fa-comments',  title: 'HOME.STEP3_TITLE', desc: 'HOME.STEP3_DESC' },
    { icon: 'fas fa-forward',   title: 'HOME.STEP4_TITLE', desc: 'HOME.STEP4_DESC' },
  ];

  // ── Values ────────────────────────────────────
  values = [
    {
      icon: 'fas fa-user-secret',
      title: 'ABOUT.VAL1_TITLE',
      desc: 'ABOUT.VAL1_DESC',
      bg: 'rgba(79,142,247,0.1)',
      color: '#4f8ef7',
    },
    {
      icon: 'fas fa-bolt',
      title: 'ABOUT.VAL2_TITLE',
      desc: 'ABOUT.VAL2_DESC',
      bg: 'rgba(6,182,212,0.1)',
      color: '#06b6d4',
    },
    {
      icon: 'fas fa-globe',
      title: 'ABOUT.VAL3_TITLE',
      desc: 'ABOUT.VAL3_DESC',
      bg: 'rgba(167,139,250,0.1)',
      color: '#a78bfa',
    },
    {
      icon: 'fas fa-shield-alt',
      title: 'ABOUT.VAL4_TITLE',
      desc: 'ABOUT.VAL4_DESC',
      bg: 'rgba(16,185,129,0.1)',
      color: '#10b981',
    },
    {
      icon: 'fas fa-heart',
      title: 'ABOUT.VAL5_TITLE',
      desc: 'ABOUT.VAL5_DESC',
      bg: 'rgba(244,63,94,0.1)',
      color: '#f43f5e',
    },
    {
      icon: 'fas fa-infinity',
      title: 'ABOUT.VAL6_TITLE',
      desc: 'ABOUT.VAL6_DESC',
      bg: 'rgba(251,191,36,0.1)',
      color: '#fbbf24',
    },
  ];

  get isDarkMode(): boolean {
    return document.body.classList.contains('dark-mode');
  }

  get currentDir() {
    return this.translate.currentLang === 'ar' ? 'rtl' : 'ltr';
  }
}

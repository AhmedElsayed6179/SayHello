import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-tips',
  imports: [TranslatePipe, CommonModule, RouterLink],
  templateUrl: './tips.html',
  styleUrl: './tips.scss',
})
export class Tips {
  constructor(private translate: TranslateService) {}

  activeCategory = 'all';

  heroBadges = [
    { icon: 'fas fa-comments',    label: 'TIPS.BADGE_CHAT' },
    { icon: 'fas fa-shield-alt',  label: 'TIPS.BADGE_SAFETY' },
    { icon: 'fas fa-microphone',  label: 'TIPS.BADGE_VOICE' },
    { icon: 'fas fa-bolt',        label: 'TIPS.BADGE_TECH' },
  ];

  categories = [
    { key: 'all',         icon: 'fas fa-th-large',     label: 'TIPS.CAT_ALL' },
    { key: 'chat',        icon: 'fas fa-comments',      label: 'TIPS.CAT_CHAT' },
    { key: 'safety',      icon: 'fas fa-shield-alt',    label: 'TIPS.CAT_SAFETY' },
    { key: 'voice',       icon: 'fas fa-microphone',    label: 'TIPS.CAT_VOICE' },
    { key: 'tech',        icon: 'fas fa-cog',           label: 'TIPS.CAT_TECH' },
  ];

  allTips = [
    // ── Chat Tips ──
    {
      category: 'TIPS.CAT_CHAT', key: 'chat', featured: true,
      icon: 'fas fa-hand-wave', iconBg: 'rgba(79,142,247,0.1)', iconColor: '#4f8ef7',
      title: 'TIPS.T1_TITLE', desc: 'TIPS.T1_DESC',
      tags: ['TIPS.TAG_BEGINNER'],
    },
    {
      category: 'TIPS.CAT_CHAT', key: 'chat', featured: false,
      icon: 'fas fa-question-circle', iconBg: 'rgba(6,182,212,0.1)', iconColor: '#06b6d4',
      title: 'TIPS.T2_TITLE', desc: 'TIPS.T2_DESC',
      tags: ['TIPS.TAG_SOCIAL'],
    },
    {
      category: 'TIPS.CAT_CHAT', key: 'chat', featured: false,
      icon: 'fas fa-smile', iconBg: 'rgba(251,191,36,0.1)', iconColor: '#fbbf24',
      title: 'TIPS.T3_TITLE', desc: 'TIPS.T3_DESC',
      tags: ['TIPS.TAG_SOCIAL'],
    },
    {
      category: 'TIPS.CAT_CHAT', key: 'chat', featured: false,
      icon: 'fas fa-language', iconBg: 'rgba(167,139,250,0.1)', iconColor: '#a78bfa',
      title: 'TIPS.T4_TITLE', desc: 'TIPS.T4_DESC',
      tags: ['TIPS.TAG_SOCIAL'],
    },
    // ── Safety Tips ──
    {
      category: 'TIPS.CAT_SAFETY', key: 'safety', featured: true,
      icon: 'fas fa-user-secret', iconBg: 'rgba(16,185,129,0.1)', iconColor: '#10b981',
      title: 'TIPS.T5_TITLE', desc: 'TIPS.T5_DESC',
      tags: ['TIPS.TAG_IMPORTANT'],
    },
    {
      category: 'TIPS.CAT_SAFETY', key: 'safety', featured: false,
      icon: 'fas fa-lock', iconBg: 'rgba(244,63,94,0.1)', iconColor: '#f43f5e',
      title: 'TIPS.T6_TITLE', desc: 'TIPS.T6_DESC',
      tags: ['TIPS.TAG_IMPORTANT'],
    },
    {
      category: 'TIPS.CAT_SAFETY', key: 'safety', featured: false,
      icon: 'fas fa-flag', iconBg: 'rgba(244,63,94,0.1)', iconColor: '#f43f5e',
      title: 'TIPS.T7_TITLE', desc: 'TIPS.T7_DESC',
      tags: ['TIPS.TAG_SAFETY'],
    },
    // ── Voice Tips ──
    {
      category: 'TIPS.CAT_VOICE', key: 'voice', featured: false,
      icon: 'fas fa-microphone-alt', iconBg: 'rgba(79,142,247,0.1)', iconColor: '#4f8ef7',
      title: 'TIPS.T8_TITLE', desc: 'TIPS.T8_DESC',
      tags: ['TIPS.TAG_VOICE'],
    },
    {
      category: 'TIPS.CAT_VOICE', key: 'voice', featured: false,
      icon: 'fas fa-headphones', iconBg: 'rgba(167,139,250,0.1)', iconColor: '#a78bfa',
      title: 'TIPS.T9_TITLE', desc: 'TIPS.T9_DESC',
      tags: ['TIPS.TAG_VOICE'],
    },
    // ── Tech Tips ──
    {
      category: 'TIPS.CAT_TECH', key: 'tech', featured: false,
      icon: 'fas fa-wifi', iconBg: 'rgba(6,182,212,0.1)', iconColor: '#06b6d4',
      title: 'TIPS.T10_TITLE', desc: 'TIPS.T10_DESC',
      tags: ['TIPS.TAG_TECH'],
    },
    {
      category: 'TIPS.CAT_TECH', key: 'tech', featured: false,
      icon: 'fas fa-mobile-alt', iconBg: 'rgba(251,191,36,0.1)', iconColor: '#fbbf24',
      title: 'TIPS.T11_TITLE', desc: 'TIPS.T11_DESC',
      tags: ['TIPS.TAG_TECH'],
    },
    {
      category: 'TIPS.CAT_TECH', key: 'tech', featured: false,
      icon: 'fas fa-browser', iconBg: 'rgba(16,185,129,0.1)', iconColor: '#10b981',
      title: 'TIPS.T12_TITLE', desc: 'TIPS.T12_DESC',
      tags: ['TIPS.TAG_TECH'],
    },
  ];

  get filteredTips() {
    if (this.activeCategory === 'all') return this.allTips;
    return this.allTips.filter(t => t.key === this.activeCategory);
  }

  setCategory(key: string) { this.activeCategory = key; }

  guideSteps = [
    { icon: 'fas fa-user-edit',  title: 'TIPS.GUIDE1_TITLE', desc: 'TIPS.GUIDE1_DESC' },
    { icon: 'fas fa-random',     title: 'TIPS.GUIDE2_TITLE', desc: 'TIPS.GUIDE2_DESC' },
    { icon: 'fas fa-comments',   title: 'TIPS.GUIDE3_TITLE', desc: 'TIPS.GUIDE3_DESC' },
    { icon: 'fas fa-heart',      title: 'TIPS.GUIDE4_TITLE', desc: 'TIPS.GUIDE4_DESC' },
  ];

  doItems = [
    'TIPS.DO1', 'TIPS.DO2', 'TIPS.DO3', 'TIPS.DO4', 'TIPS.DO5',
  ];
  dontItems = [
    'TIPS.DONT1', 'TIPS.DONT2', 'TIPS.DONT3', 'TIPS.DONT4', 'TIPS.DONT5',
  ];

  get isDarkMode(): boolean { return document.body.classList.contains('dark-mode'); }
  get currentDir() { return this.translate.currentLang === 'ar' ? 'rtl' : 'ltr'; }
}

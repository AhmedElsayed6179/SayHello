import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
const COOLDOWN_KEY = 'faq_last_sent';

@Component({
  selector: 'app-faq',
  imports: [TranslatePipe, CommonModule, RouterLink, FormsModule],
  templateUrl: './faq.html',
  styleUrl: './faq.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Faq implements OnDestroy {
  constructor(private translate: TranslateService, private cdr: ChangeDetectorRef) {
    this.checkCooldown();
  }

  // ── Search & Tab ──────────────────────────────
  searchQuery = '';
  activeTab = 'all';

  openIndex: number | null = null;

  // ── Form ──────────────────────────────────────
  form = { name: '', email: '', subject: '', message: '' };
  isSending = false;
  formSent = false;
  cooldownActive = false;
  cooldownDisplay = '';
  private cooldownInterval: any;

  // ── FAQ Data ──────────────────────────────────
  faqCategories = [
    { key: 'all', icon: 'fas fa-th-large', label: 'FAQ.CAT_ALL' },
    { key: 'general', icon: 'fas fa-info-circle', label: 'FAQ.CAT_GENERAL' },
    { key: 'privacy', icon: 'fas fa-shield-alt', label: 'FAQ.CAT_PRIVACY' },
    { key: 'chat', icon: 'fas fa-comments', label: 'FAQ.CAT_CHAT' },
    { key: 'tech', icon: 'fas fa-cog', label: 'FAQ.CAT_TECH' },
  ];

  allFaqs = [
    // ── General ──
    {
      key: 'general',
      icon: 'fas fa-info-circle', iconBg: 'rgba(79,142,247,0.1)', iconColor: '#4f8ef7',
      question: 'FAQ.Q1', answer: 'FAQ.A1',
    },
    {
      key: 'general',
      icon: 'fas fa-user-plus', iconBg: 'rgba(6,182,212,0.1)', iconColor: '#06b6d4',
      question: 'FAQ.Q2', answer: 'FAQ.A2',
    },
    {
      key: 'general',
      icon: 'fas fa-globe', iconBg: 'rgba(167,139,250,0.1)', iconColor: '#a78bfa',
      question: 'FAQ.Q3', answer: 'FAQ.A3',
    },
    {
      key: 'general',
      icon: 'fas fa-infinity', iconBg: 'rgba(251,191,36,0.1)', iconColor: '#fbbf24',
      question: 'FAQ.Q4', answer: 'FAQ.A4',
    },
    // ── Privacy ──
    {
      key: 'privacy',
      icon: 'fas fa-user-secret', iconBg: 'rgba(16,185,129,0.1)', iconColor: '#10b981',
      question: 'FAQ.Q5', answer: 'FAQ.A5',
    },
    {
      key: 'privacy',
      icon: 'fas fa-database', iconBg: 'rgba(244,63,94,0.1)', iconColor: '#f43f5e',
      question: 'FAQ.Q6', answer: 'FAQ.A6',
    },
    {
      key: 'privacy',
      icon: 'fas fa-lock', iconBg: 'rgba(16,185,129,0.1)', iconColor: '#10b981',
      question: 'FAQ.Q7', answer: 'FAQ.A7',
    },
    // ── Chat ──
    {
      key: 'chat',
      icon: 'fas fa-forward', iconBg: 'rgba(79,142,247,0.1)', iconColor: '#4f8ef7',
      question: 'FAQ.Q8', answer: 'FAQ.A8',
    },
    {
      key: 'chat',
      icon: 'fas fa-microphone', iconBg: 'rgba(167,139,250,0.1)', iconColor: '#a78bfa',
      question: 'FAQ.Q9', answer: 'FAQ.A9',
    },
    {
      key: 'chat',
      icon: 'fas fa-video', iconBg: 'rgba(6,182,212,0.1)', iconColor: '#06b6d4',
      question: 'FAQ.Q10', answer: 'FAQ.A10',
    },
    {
      key: 'chat',
      icon: 'fas fa-smile', iconBg: 'rgba(251,191,36,0.1)', iconColor: '#fbbf24',
      question: 'FAQ.Q11', answer: 'FAQ.A11',
    },
    // ── Tech ──
    {
      key: 'tech',
      icon: 'fas fa-wifi', iconBg: 'rgba(6,182,212,0.1)', iconColor: '#06b6d4',
      question: 'FAQ.Q12', answer: 'FAQ.A12',
    },
    {
      key: 'tech',
      icon: 'fas fa-mobile-alt', iconBg: 'rgba(79,142,247,0.1)', iconColor: '#4f8ef7',
      question: 'FAQ.Q13', answer: 'FAQ.A13',
    },
    {
      key: 'tech',
      icon: 'fas fa-cog', iconBg: 'rgba(167,139,250,0.1)', iconColor: '#a78bfa',
      question: 'FAQ.Q14', answer: 'FAQ.A14',
    },
  ];

  get filteredFaqs() {
    let list = this.allFaqs;
    if (this.activeTab !== 'all') {
      list = list.filter(f => f.key === this.activeTab);
    }
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(f => {
        const qt = this.translate.instant(f.question).toLowerCase();
        const at = this.translate.instant(f.answer).toLowerCase();
        return qt.includes(q) || at.includes(q);
      });
    }
    return list;
  }

  getCategoryCount(key: string): number {
    if (key === 'all') return this.allFaqs.length;
    return this.allFaqs.filter(f => f.key === key).length;
  }

  setTab(key: string) { this.activeTab = key; this.openIndex = null; }

  toggle(i: number) { this.openIndex = this.openIndex === i ? null : i; }

  onSearch() { this.openIndex = null; }

  clearSearch() { this.searchQuery = ''; this.openIndex = null; }

  // ── Cooldown ──────────────────────────────────
  private checkCooldown() {
    const last = localStorage.getItem(COOLDOWN_KEY);
    if (!last) return;
    const elapsed = Date.now() - parseInt(last, 10);
    if (elapsed < COOLDOWN_MS) {
      this.startCooldownTimer(COOLDOWN_MS - elapsed);
    }
  }

  private startCooldownTimer(remaining: number) {
    this.cooldownActive = true;
    this.updateDisplay(remaining);
    this.cdr.markForCheck();
    this.cooldownInterval = setInterval(() => {
      remaining -= 1000;
      if (remaining <= 0) {
        clearInterval(this.cooldownInterval);
        this.cooldownActive = false;
        this.cooldownDisplay = '';
      } else {
        this.updateDisplay(remaining);
      }
      this.cdr.markForCheck();
    }, 1000);
  }

  private updateDisplay(ms: number) {
    const min = Math.floor(ms / 60000);
    const sec = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
    this.cooldownDisplay = `${min}:${sec}`;
  }

  // ── Submit Form ───────────────────────────────
  async submitForm() {
    if (this.cooldownActive || this.isSending) return;
    if (!this.form.name || !this.form.email || !this.form.subject || !this.form.message) return;

    this.isSending = true;
    try {
      const res = await fetch('https://formspree.io/f/xqeygdab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          name: this.form.name,
          email: this.form.email,
          subject: this.form.subject,
          message: this.form.message,
        }),
      });

      if (res.ok) {
        this.formSent = true;
        this.form = { name: '', email: '', subject: '', message: '' };
        localStorage.setItem(COOLDOWN_KEY, Date.now().toString());
        this.startCooldownTimer(COOLDOWN_MS);
        this.cdr.markForCheck();
      }
    } catch {
      // silent fail — could add error handling
    } finally {
      this.isSending = false;
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy() { clearInterval(this.cooldownInterval); }

  get isDarkMode(): boolean { return document.body.classList.contains('dark-mode'); }
  get currentDir() { return this.translate.currentLang === 'ar' ? 'rtl' : 'ltr'; }
}

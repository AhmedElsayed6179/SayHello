import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, HostListener, NgZone, ChangeDetectorRef, OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import Swal from 'sweetalert2';
import { environment } from '../../environments/environment.development';
import { ChatService } from '../../service/chat-service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-home',
  imports: [TranslatePipe, CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './home.html',
  styleUrls: ['./home.scss'],
})
export class Home implements AfterViewInit, OnDestroy, OnInit {
  @ViewChild('demoVideo') demoVideoRef!: ElementRef<HTMLVideoElement>;

  usernameForm: FormGroup;
  sections: any[] = [];
  showModeSelector = false;
  private pendingName = '';
  private observer!: IntersectionObserver;
  private sub!: Subscription;

  // ── Video state ────────────────────────────────
  isVideoPlaying = false;
  isMuted = true;
  isFullscreen = false;

  // ── Hero Stats ─────────────────────────────────
  heroStats = [
    { value: '0+', label: 'HOME.STAT_USERS' },
    { value: '50+', label: 'HOME.STAT_COUNTRIES' },
    { value: '100%', label: 'HOME.STAT_FREE' },
  ];

  // ── How It Works Steps ─────────────────────────
  howSteps = [
    { icon: 'fas fa-user-edit', title: 'HOME.STEP1_TITLE', desc: 'HOME.STEP1_DESC' },
    { icon: 'fas fa-random', title: 'HOME.STEP2_TITLE', desc: 'HOME.STEP2_DESC' },
    { icon: 'fas fa-comments', title: 'HOME.STEP3_TITLE', desc: 'HOME.STEP3_DESC' },
    { icon: 'fas fa-forward', title: 'HOME.STEP4_TITLE', desc: 'HOME.STEP4_DESC' },
  ];

  // ── Mode Features ──────────────────────────────
  chatFeatures = ['HOME.CHAT_F1', 'HOME.CHAT_F2', 'HOME.CHAT_F3', 'HOME.CHAT_F4'];
  videoFeatures = ['HOME.VIDEO_F1', 'HOME.VIDEO_F2', 'HOME.VIDEO_F3', 'HOME.VIDEO_F4'];

  // ── Trust Items ────────────────────────────────
  trustItems = [
    { icon: 'fas fa-user-secret', title: 'HOME.TRUST_ANON_TITLE', desc: 'HOME.TRUST_ANON_DESC' },
    { icon: 'fas fa-lock', title: 'HOME.TRUST_ENC_TITLE', desc: 'HOME.TRUST_ENC_DESC' },
    { icon: 'fas fa-ban', title: 'HOME.TRUST_NODATA_TITLE', desc: 'HOME.TRUST_NODATA_DESC' },
  ];

  // ── Video source map per language ─────────────
  private videoSrcMap: Record<string, string> = {
    en: 'videos/SayHello-demo-en.mp4',
    ar: 'videos/SayHello-demo-ar.mp4',
    es: 'videos/SayHello-demo-es.mp4',
  };

  constructor(private router: Router, private translate: TranslateService, private chatService: ChatService, private zone: NgZone, private cd: ChangeDetectorRef) {
    this.usernameForm = new FormGroup({
      username: new FormControl<string>('', {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(20),
          Validators.pattern(/^[a-zA-Z\u0600-\u06FF]+( [a-zA-Z\u0600-\u06FF]+)*$/),
        ],
      }),
    });

    this.usernameForm.get('username')?.valueChanges.subscribe((value) => {
      if (value) {
        // trimStart immediately so leading spaces never block typing
        // collapse multiple spaces mid-word
        const normalized = value.replace(/\s+/g, ' ').trimStart();
        if (value !== normalized) {
          this.usernameForm.get('username')?.setValue(normalized, { emitEvent: false });
        }
      }
    });

    this.sections = [
      {
        icon: 'fas fa-bolt',
        title: 'SECTIONS.ONE.TITLE',
        desc: 'SECTIONS.ONE.DESC',
        details: ['SECTIONS.ONE.DETAIL1', 'SECTIONS.ONE.DETAIL2', 'SECTIONS.ONE.DETAIL3'],
      },
      {
        icon: 'fas fa-globe',
        title: 'SECTIONS.TWO.TITLE',
        desc: 'SECTIONS.TWO.DESC',
        details: ['SECTIONS.TWO.DETAIL1', 'SECTIONS.TWO.DETAIL2', 'SECTIONS.TWO.DETAIL3'],
      },
      {
        icon: 'fas fa-shield-alt',
        title: 'SECTIONS.THREE.TITLE',
        desc: 'SECTIONS.THREE.DESC',
        details: ['SECTIONS.THREE.DETAIL1', 'SECTIONS.THREE.DETAIL2', 'SECTIONS.THREE.DETAIL3'],
      },
    ];
  }

  ngOnInit() {
    this.sub = this.chatService.connectedUsers$.subscribe(count => {
      this.heroStats[0].value = count + '+';
    });
  }

  // ── Scroll Reveal ──────────────────────────────
  ngAfterViewInit(): void {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            this.observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );

    document
      .querySelectorAll('.reveal, .reveal-left, .reveal-right')
      .forEach((el) => this.observer.observe(el));

    // iOS Safari fires 'webkitendfullscreen' on the <video> element
    // when the user exits fullscreen via the OS controls (swipe down / done button)
    const video = this.demoVideoRef?.nativeElement as HTMLVideoElement | null;
    if (video) {
      video.addEventListener('webkitendfullscreen', () => {
        this.isFullscreen = false;
      });
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.sub?.unsubscribe();
  }

  // ── Helpers ────────────────────────────────────
  get currentDir() {
    return this.translate.currentLang === 'ar' ? 'rtl' : 'ltr';
  }

  scrollToHero() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Language-aware video source ────────────────
  /**
   * Returns the video source URL for the current language.
   * Falls back to English if no specific video exists for the language.
   */
  get demoVideoSrc(): string {
    const lang = this.translate.currentLang || 'en';
    return this.videoSrcMap[lang] ?? this.videoSrcMap['en'];
  }

  // ── Video ──────────────────────────────────────
  playVideo() {
    this.isVideoPlaying = true;
    setTimeout(() => {
      const video = this.demoVideoRef?.nativeElement;
      if (video) {
        const langSrc = this.demoVideoSrc;
        if (video.getAttribute('data-lang-src') !== langSrc) {
          video.setAttribute('data-lang-src', langSrc);
          const sourceEl = video.querySelector('source');
          if (sourceEl) {
            sourceEl.setAttribute('src', langSrc);
          }
          video.load();
        }
        video.muted = true;
        this.isMuted = true;
        video.play().catch(() => { });
      }
    }, 50);
  }

  stopVideo() {
    this.isVideoPlaying = false;
    const video = this.demoVideoRef?.nativeElement;
    if (video) {
      video.pause();
      video.currentTime = 0;
      video.muted = true;
      this.isMuted = true;
    }
  }

  toggleMute() {
    const video = this.demoVideoRef?.nativeElement;
    if (video) {
      video.muted = !video.muted;
      this.isMuted = video.muted;
    }
  }

  onVideoEnded() { }

  // ── Fullscreen ─────────────────────────────────
  // Strategy:
  //   Mobile  → native video.requestFullscreen() / webkitEnterFullscreen()
  //             This is exactly what YouTube does — the OS takes over,
  //             no Angular shell / navbar can bleed through.
  //   Desktop → container.requestFullscreen() for a cinematic experience.

  private isMobile(): boolean {
    return window.innerWidth <= 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  }

  toggleFullscreen() {
    if (this.isFullscreen) {
      this.exitFullscreen();
    } else {
      this.enterFullscreen();
    }
  }

  enterFullscreen() {
    const video = this.demoVideoRef?.nativeElement as HTMLVideoElement | null;
    const container = video?.closest?.('.video-container') as HTMLElement | null;
    if (!video || !container) return;

    if (this.isMobile()) {
      // ── Mobile: ask the <video> element itself to go fullscreen ──
      // This is the ONLY reliable way on iOS Safari + Android Chrome.
      // The OS-level player takes over, so the Angular shell is irrelevant.
      const req =
        (video as any).webkitEnterFullscreen?.()   // iOS Safari
        ?? video.requestFullscreen?.()              // Android Chrome / Firefox
        ?? (video as any).mozRequestFullScreen?.()
        ?? (video as any).msRequestFullscreen?.();

      if (req instanceof Promise) {
        req.then(() => { this.isFullscreen = true; }).catch(() => { });
      } else {
        // webkitEnterFullscreen() is synchronous on iOS — no promise
        this.isFullscreen = true;
      }
    } else {
      // ── Desktop: fullscreen on the container div ──
      const req =
        container.requestFullscreen?.()
        ?? (container as any).webkitRequestFullscreen?.()
        ?? (container as any).mozRequestFullScreen?.()
        ?? (container as any).msRequestFullscreen?.();

      if (req instanceof Promise) {
        req.then(() => { this.isFullscreen = true; }).catch(() => { });
      }
    }
  }

  exitFullscreen() {
    this.isFullscreen = false;
    // Clean up any CSS fullscreen remnants (shouldn't be set now, but safety net)
    const container = this.demoVideoRef?.nativeElement?.closest?.('.video-container') as HTMLElement | null;
    container?.classList.remove('video-fullscreen');
    document.body.classList.remove('video-fs-open');
    document.documentElement.classList.remove('video-fs-open');

    if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
      (document.exitFullscreen?.() ?? (document as any).webkitExitFullscreen?.())?.catch?.(() => { });
    }
  }

  // Double-tap detection for mobile (dblclick doesn't fire on touch)
  private lastTap = 0;
  onVideoTap(event: Event) {
    if (!this.isVideoPlaying) return;
    const now = Date.now();
    const delta = now - this.lastTap;
    if (delta < 350 && delta > 0) {
      event.preventDefault();
      this.toggleFullscreen();
    }
    this.lastTap = now;
  }

  @HostListener('document:fullscreenchange')
  @HostListener('document:webkitfullscreenchange')
  onFullscreenChange() {
    const isStillFullscreen =
      !!document.fullscreenElement ||
      !!(document as any).webkitFullscreenElement ||
      !!(this.demoVideoRef?.nativeElement as any)?.webkitDisplayingFullscreen;

    if (!isStillFullscreen) {
      this.isFullscreen = false;
      // Clean up CSS fullscreen if it was ever applied
      const container = this.demoVideoRef?.nativeElement?.closest?.('.video-container') as HTMLElement | null;
      container?.classList.remove('video-fullscreen');
      document.body.classList.remove('video-fs-open');
      document.documentElement.classList.remove('video-fs-open');
    }
  }

  @HostListener('document:keydown.escape')
  onEscKey() {
    if (this.isFullscreen) this.exitFullscreen();
  }

  // ── Chat Navigation ────────────────────────────
  openModeWithName(mode: 'chat' | 'video') {
    // Final trim before navigation — handles trailing space edge case
    const rawVal = this.usernameForm.value.username?.trim();
    if (rawVal) {
      this.usernameForm.get('username')?.setValue(rawVal, { emitEvent: false });
    }
    const nameVal = rawVal;
    if (!nameVal || this.usernameForm.invalid) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      Swal.fire({
        icon: 'info',
        title: this.translate.instant('HOME.ERROR_TITLE'),
        text: this.translate.instant('HOME.ERROR_REQUIRED'),
        confirmButtonText: this.translate.instant('HOME.ERROR_OK'),
      });
      return;
    }
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    this.pendingName = `${nameVal}-${randomSuffix}`;
    this._doNavigate(mode);
  }

  startChat() {
    if (this.usernameForm.invalid) {
      const errors = this.usernameForm.controls['username'].errors;
      let message = '';
      if (errors?.['required']) message = this.translate.instant('HOME.ERROR_REQUIRED');
      else if (errors?.['minlength']) message = this.translate.instant('HOME.ERROR_MINLENGTH');
      else if (errors?.['maxlength']) message = this.translate.instant('HOME.ERROR_MAXLENGTH');
      else if (errors?.['pattern']) message = this.translate.instant('HOME.ERROR_PATTERN');

      Swal.fire({
        icon: 'error',
        title: this.translate.instant('HOME.ERROR_TITLE'),
        text: message,
        confirmButtonText: this.translate.instant('HOME.ERROR_OK'),
      });
      return;
    }

    const name = this.usernameForm.value.username
      .replace(/\s+/g, ' ')
      .trim();

    if (!name) return;

    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    this.pendingName = `${name}-${randomSuffix}`;
    this.showModeSelector = true;
  }

  selectMode(mode: 'chat' | 'video') {
    this.showModeSelector = false;
    this._doNavigate(mode);
  }

  private _doNavigate(mode: 'chat' | 'video') {
    const name = this.pendingName;
    fetch(`${environment.SayHello_Server}/start-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('server');
        return res.json();
      })
      .then((data) => {
        const token = data.token;
        if (mode === 'video') {
          this.router.navigate(['/videocall'], { queryParams: { token }, state: { name } });
        } else {
          this.router.navigate(['/chat'], { queryParams: { token }, state: { name } });
        }
      })
      .catch(() => {
        Swal.fire({
          icon: 'error',
          title: this.translate.instant('HOME.ERROR_INTERNET'),
          text: this.translate.instant('HOME.ERROR_SERVER'),
          confirmButtonText: this.translate.instant('HOME.ERROR_OK'),
        });
      });
  }

  closeModeSelector() {
    this.showModeSelector = false;
  }

  get isDarkMode(): boolean {
    return document.body.classList.contains('dark-mode');
  }


}

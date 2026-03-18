import {
  Component, NgZone, OnInit, OnDestroy, HostListener,
  ViewChild, ElementRef, ChangeDetectorRef,
  ViewChildren, QueryList
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { io, Socket } from 'socket.io-client';
import Swal from 'sweetalert2';
import { ChatService } from '../../service/chat-service';
import { environment } from '../../environments/environment.development';
import { ChatMessage } from '../../models/chat-message';
import { PickerModule } from '@ctrl/ngx-emoji-mart';
@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, PickerModule],
  templateUrl: './chat.html',
  styleUrls: ['./chat.scss'],
})
export class Chat implements OnInit, OnDestroy {
  @ViewChild('chatBox') chatBox!: ElementRef;
  @ViewChildren('audio') audioEls!: QueryList<ElementRef<HTMLAudioElement>>;

  socket!: Socket;
  messages: ChatMessage[] = [];
  message = '';
  token = '';
  connected = false;
  waiting = false;
  isTyping = false;
  waitingMessageShown = false;
  private typingTimeout: any;
  public myName = '';
  showEmoji = false;
  connectedUsers = 0;
  confirmNext = false;
  private confirmTimeout: any;
  exitConfirm = false;
  private exitTimeout: any;
  mediaRecorder!: MediaRecorder;
  audioChunks: Blob[] = [];
  isRecording = false;
  isCanceled = false;
  recordTime = '0:00';
  private recordInterval: any;
  sendSound = new Audio('sendSound.mp3');
  deleteSound = new Audio('deleteSound.wav');
  showWelcome = true;
  partnerRecording = false;
  private recordingTimeout: any;
  private recordingPing: any;
  isRecordingPaused = false;
  recordedSeconds = 0;
  private micStream: MediaStream | null = null;
  private recordStartTime = 0;
  private pausedAt = 0;          // timestamp when pause started
  private totalPausedMs = 0;     // cumulative paused duration in ms
  partnerDisconnected = false;

  constructor(
    private route: ActivatedRoute,
    private zone: NgZone,
    private translate: TranslateService,
    private cd: ChangeDetectorRef,
    private router: Router,
    private chatService: ChatService
  ) { }

  ngOnInit() {
    this.route.queryParams.subscribe(p => { this.token = p['token']; });
    this.myName = history.state?.name;
    if (!this.token || !this.myName) { this.router.navigate(['/']); return; }
  }

  startChat() {
    this.showWelcome = false;
    // Push a state so the browser back button triggers popstate instead of leaving the page
    history.pushState({ chatActive: true }, '');
    this.connectToServer();
  }

  connectToServer() {
    fetch(`${environment.SayHello_Server}/start-chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: this.myName })
    })
      .then(r => { if (!r.ok) throw 0; return r.json(); })
      .then(d => this.initSocket(d.token))
      .catch(() => { Swal.fire('Error', 'Failed to connect', 'error'); this.router.navigate(['/']); });
  }

  initSocket(token: string) {
    if (this.socket) { this.socket.emit('leave'); this.socket.disconnect(); }
    this.socket = io(`${environment.SayHello_Server}`, { transports: ['websocket'] });
    this.socket.emit('join', token);

    this.socket.on('connected', () => this.zone.run(() => {
      this.connected = true; this.waiting = false;
      const wi = this.messages.findIndex(m => m.key === 'CHAT.WAITING');
      if (wi !== -1) { this.messages.splice(wi, 1); this.waitingMessageShown = false; }
      this.addSystemMessage('CHAT.CONNECTED');
    }));

    this.socket.on('user_count', (c: number) => this.zone.run(() => {
      this.connectedUsers = c; this.chatService.connectedUsers$.next(c); this.cd.detectChanges();
    }));

    this.socket.on('waiting', () => this.zone.run(() => {
      this.connected = false; this.waiting = true;
      if (!this.waitingMessageShown) { this.addSystemMessage('CHAT.WAITING'); this.waitingMessageShown = true; }
    }));

    this.socket.on('partner_left', () => this.zone.run(() => {
      this.connected = false; this.partnerDisconnected = true;
      if (this.isRecording) {
        this.isCanceled = true; this.mediaRecorder?.stop();
        this.stopRecordTimer(); this.stopRecordingPing(); this.stopMicStream(); this.isRecording = false;
        Swal.fire({ icon: 'info', title: this.translate.instant('CHAT.INFO'), text: this.translate.instant('CHAT.RECORD_CANCELED'), confirmButtonText: this.translate.instant('HOME.ERROR_OK') });
      }
      this.addSystemMessage('CHAT.PARTNER_LEFT'); this.cd.detectChanges();
    }));

    // ── Incoming messages ──
    this.socket.on('newMessage', (msg: any) => this.zone.run(() => {
      if (!this.messages.find(m => m.id === msg.id)) {
        this.messages.push({
          id: msg.id, sender: 'user', senderName: msg.sender,
          text: msg.text, time: this.formatTime(msg.time),
          status: 'sent'  // incoming = delivered to us
        });
        // Auto-send seen if chat is visible
        this.socket.emit('messageSeen', { messageId: msg.id });
      }
      this.scrollToBottom(); this.cd.detectChanges();
    }));

    // Seen confirmation from partner
    this.socket.on('messageSeen', (d: { messageId: string }) => this.zone.run(() => {
      const m = this.messages.find(x => x.id === d.messageId);
      if (m) { m.status = 'seen'; this.cd.detectChanges(); }
    }));

    this.socket.on('typing', () => this.zone.run(() => {
      this.isTyping = true; this.cd.detectChanges();
      clearTimeout(this.typingTimeout);
      this.typingTimeout = setTimeout(() => { this.isTyping = false; this.cd.detectChanges(); }, 1000);
    }));

    this.socket.on('newVoice', (msg: any) => this.zone.run(() => {
      const isOwnMsg = msg.sender === this.myName;

      // Own voice: just upgrade status of existing message (already added in uploadVoice)
      if (isOwnMsg) {
        const existing = this.messages.find(m => m.id === msg.id);
        if (existing) { existing.status = 'sent'; this.cd.detectChanges(); }
        return;
      }

      // Partner's voice message
      const chatMsg: ChatMessage = {
        id: msg.id, sender: 'user', senderName: msg.sender,
        audioUrl: msg.url, duration: msg.duration,
        remainingTime: this.formatSeconds(msg.duration), isPlaying: false,
        time: this.formatTime(msg.time),
        status: 'sent'
      };
      this.messages.push(chatMsg); this.cd.detectChanges(); this.scrollToBottom();

      // Auto-send seen — we received it
      this.socket.emit('messageSeen', { messageId: msg.id });

      setTimeout(() => {
        const list = this.audioEls.toArray();
        if (!list.length) return;
        const last = list[list.length - 1];
        chatMsg.audioRef = last.nativeElement;
        chatMsg.audioRef.onended = () => this.zone.run(() => {
          chatMsg.isPlaying = false;
          chatMsg.remainingTime = this.formatSeconds(chatMsg.duration!);
          chatMsg.audioRef!.currentTime = 0; this.cd.detectChanges();
        });
        chatMsg.audioRef.ontimeupdate = () => {
          const rem = Math.max(chatMsg.duration! - Math.floor(chatMsg.audioRef!.currentTime), 0);
          this.zone.run(() => { chatMsg.remainingTime = this.formatSeconds(rem); this.cd.detectChanges(); });
        };
      }, 50);
      this.scrollToBottom(); this.cd.detectChanges();
    }));

    this.socket.on('partnerRecording', (rec: boolean) => this.zone.run(() => {
      if (rec) {
        this.partnerRecording = true;
        clearTimeout(this.recordingTimeout);
        this.recordingTimeout = setTimeout(() => { this.partnerRecording = false; this.cd.detectChanges(); }, 1500);
      } else { this.partnerRecording = false; clearTimeout(this.recordingTimeout); }
      this.cd.detectChanges();
    }));

    this.socket.on('newReaction', (d: any) => {
      const m = this.messages.find(x => x.id === d.messageId);
      if (m) { m.reactions = d.reactions; this.cd.detectChanges(); }
    });
  }

  // ── Recording ──────────────────────────────────
  async startRecording() {
    if (!this.connected) return;
    if (!this.isMediaRecorderSupported()) {
      Swal.fire({
        icon: 'warning', title: this.translate.instant('CHAT.Unsupported'), text: this.translate.instant('CHAT.browser'),
        showCancelButton: true, confirmButtonText: this.translate.instant('HOME.ERROR_OK'), cancelButtonText: this.translate.instant('CHAT.Cancel')
      });
      return;
    }
    this.recordedSeconds = 0; this.recordTime = '0:00';
    this.audioChunks = []; this.isCanceled = false; this.isRecordingPaused = false;
    this.pausedAt = 0; this.totalPausedMs = 0;
    this.cd.detectChanges();
    if (!this.micStream) this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(this.micStream);
    this.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) this.audioChunks.push(e.data); };
    this.mediaRecorder.onstop = () => {
      this.stopRecordTimer(); this.stopRecordingPing(); this.socket.emit('stopRecording');
      if (this.partnerDisconnected || this.isCanceled || this.audioChunks.length === 0) {
        this.audioChunks = []; this.stopMicStream(); return;
      }
      if (!this.isCanceled && this.audioChunks.length > 0) {
        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.uploadVoice(blob, this.recordedSeconds);
      }
      this.recordedSeconds = 0; this.recordTime = '0:00'; this.audioChunks = [];
      this.stopMicStream(); this.cd.detectChanges();
    };
    this.mediaRecorder.start(); this.isRecording = true; this.recordStartTime = Date.now();
    this.startRecordTimer(); this.startRecordingPing();
  }

  startRecordingPing() {
    this.stopRecordingPing();
    this.recordingPing = setInterval(() => { if (!this.isRecordingPaused) this.socket.emit('startRecording'); }, 800);
  }
  stopRecordingPing() { if (this.recordingPing) { clearInterval(this.recordingPing); this.recordingPing = null; } }

  cancelRecording() {
    this.stopRecordTimer();
    if (this.isRecording) {
      this.isCanceled = true; clearInterval(this.recordingPing);
      this.socket.emit('stopRecording'); this.mediaRecorder?.stop();
      this.stopMicStream(); this.isRecording = false; this.cd.detectChanges();
      this.deleteSound.currentTime = 0; this.deleteSound.play().catch(() => { });
    }
  }

  stopRecording() {
    if (!this.mediaRecorder || !this.isRecording) return;
    clearInterval(this.recordingPing); this.socket.emit('stopRecording');
    this.mediaRecorder.stop(); this.isRecording = false;
  }

  togglePauseResume() {
    if (!this.mediaRecorder) return;
    if (this.isRecordingPaused) {
      // Resume — accumulate how long we were paused
      this.totalPausedMs += Date.now() - this.pausedAt;
      this.mediaRecorder.resume(); this.isRecordingPaused = false;
      this.startRecordTimer(); this.startRecordingPing(); this.socket.emit('resumeRecording');
    } else {
      // Pause — record the moment we paused
      this.pausedAt = Date.now();
      this.mediaRecorder.pause(); this.isRecordingPaused = true;
      this.stopRecordTimer(); this.stopRecordingPing(); this.socket.emit('pauseRecording');
    }
  }

  startRecordTimer() {
    clearInterval(this.recordInterval);
    this.recordInterval = setInterval(() => {
      if (this.isRecordingPaused) return;
      const activeMs = Date.now() - this.recordStartTime - this.totalPausedMs;
      this.recordedSeconds = Math.floor(activeMs / 1000);
      const m = Math.floor(this.recordedSeconds / 60);
      const s = (this.recordedSeconds % 60).toString().padStart(2, '0');
      this.recordTime = `${m}:${s}`; this.cd.detectChanges();
    }, 200);
  }
  stopRecordTimer() { clearInterval(this.recordInterval); }

  private stopMicStream() { if (this.micStream) { this.micStream.getTracks().forEach(t => t.stop()); this.micStream = null; } }

  uploadVoice(blob: Blob, duration: number) {
    const fd = new FormData();
    fd.append('voice', blob, 'voice.webm');
    fd.append('room', (this.socket as any).room);
    const id = this.generateUniqueId();
    // Add own message immediately with 'sending' status
    const ownMsg: any = {
      id, sender: 'user', senderName: this.myName,
      audioUrl: '', duration,
      remainingTime: this.formatSeconds(duration), isPlaying: false,
      time: this.formatTime(new Date().toISOString()), status: 'sending'
    };
    this.messages.push(ownMsg); this.scrollToBottom(); this.cd.detectChanges();

    fetch(`${environment.SayHello_Server}/upload-voice`, { method: 'POST', body: fd })
      .then(r => r.json())
      .then(d => {
        ownMsg.audioUrl = d.url;
        ownMsg.status = 'sent';
        this.socket.emit('sendVoice', { id, url: d.url, duration, room: (this.socket as any).room });
        this.sendSound.currentTime = 0; this.sendSound.play().catch(() => { });
        this.cd.detectChanges();
        // Assign audioRef so the sender can play back their own voice message
        setTimeout(() => {
          const list = this.audioEls.toArray();
          const el = list.find(a => a.nativeElement.src === d.url || a.nativeElement.getAttribute('src') === d.url);
          const target = el ?? list[list.length - 1];
          if (target) {
            ownMsg.audioRef = target.nativeElement;
            ownMsg.audioRef.onended = () => this.zone.run(() => {
              ownMsg.isPlaying = false;
              ownMsg.remainingTime = this.formatSeconds(ownMsg.duration!);
              ownMsg.audioRef!.currentTime = 0; this.cd.detectChanges();
            });
            ownMsg.audioRef.ontimeupdate = () => {
              const rem = Math.max(ownMsg.duration! - Math.floor(ownMsg.audioRef!.currentTime), 0);
              this.zone.run(() => { ownMsg.remainingTime = this.formatSeconds(rem); this.cd.detectChanges(); });
            };
          }
        }, 100);
      });
  }

  // ── Messages ──────────────────────────────────
  sendMessage() {
    if (!this.connected || this.partnerDisconnected) {
      Swal.fire({ icon: 'info', title: this.translate.instant('CHAT.PARTNER'), text: this.translate.instant('CHAT.message_NO_PARTNER'), confirmButtonText: this.translate.instant('HOME.ERROR_OK') });
      return;
    }
    const text = this.message.trim();
    if (!text) {
      Swal.fire({ icon: 'info', title: this.translate.instant('CHAT.Empty_text'), text: this.translate.instant('CHAT.empty_message'), confirmButtonText: this.translate.instant('HOME.ERROR_OK') });
      return;
    }
    const id = this.generateUniqueId();
    const msg: ChatMessage = { id, sender: 'user', senderName: this.myName, text, time: this.formatTime(new Date().toISOString()), status: 'sending' };
    this.messages.push(msg);
    this.socket.emit('sendMessage', { id, text });
    this.message = '';
    this.sendSound.currentTime = 0; this.sendSound.play().catch(() => { });
    this.scrollToBottom(); this.cd.detectChanges();
    // upgrade to 'sent' after short delay (server echo)
    setTimeout(() => { const m = this.messages.find(x => x.id === id); if (m && m.status === 'sending') { m.status = 'sent'; this.cd.detectChanges(); } }, 600);
  }

  reactToMessage(msg: ChatMessage, reaction: string) {
    if (!msg.id) return;
    this.socket.emit('react', { messageId: msg.id, reaction, sender: this.myName });
  }
  toggleReaction(msg: ChatMessage, reaction: string) {
    if (!msg.reactions) msg.reactions = {};
    if (!msg.reactions[reaction]) msg.reactions[reaction] = [];
    const i = msg.reactions[reaction].indexOf(this.myName);
    if (i === -1) msg.reactions[reaction].push(this.myName); else msg.reactions[reaction].splice(i, 1);
    this.socket.emit('react', { messageId: msg.id, reaction, sender: this.myName }); this.cd.detectChanges();
  }

  onTyping() { if (this.connected) this.socket.emit('typing'); }

  togglePlay(msg: ChatMessage) {
    const a = msg.audioRef!; if (!a) return;
    if (msg.isPlaying) { a.pause(); msg.isPlaying = false; return; }
    a.play(); msg.isPlaying = true;
    a.ontimeupdate = () => { const r = Math.max((msg.duration || 0) - Math.floor(a.currentTime), 0); msg.remainingTime = this.formatSeconds(r); this.cd.detectChanges(); };
    a.onended = () => { msg.isPlaying = false; msg.remainingTime = this.formatSeconds(msg.duration || 0); a.currentTime = 0; this.cd.detectChanges(); };
  }

  seekAudio(msg: ChatMessage, event: any) {
    const a = msg.audioRef; if (!a) return;
    const v = Number(event.target.value); const was = msg.isPlaying;
    a.currentTime = v; msg.remainingTime = this.formatSeconds(Math.max((msg.duration || 0) - v, 0));
    if (was && a.paused) a.play(); this.cd.detectChanges();
  }

  toggleEmoji() { this.showEmoji = !this.showEmoji; }
  onOpentoggleEmoji() {
    if (!this.connected) {
      Swal.fire({ icon: 'info', title: this.translate.instant('CHAT.PARTNER'), text: this.translate.instant('CHAT.EMOJI_NO_PARTNER'), confirmButtonText: this.translate.instant('HOME.ERROR_OK') }); return;
    }
    this.showEmoji = !this.showEmoji;
    this.cd.detectChanges();
  }
  onEmojiSelect(event: any) {
    this.message += event.emoji?.native ?? event.emoji?.colons ?? '';
    this.showEmoji = false;
    this.cd.detectChanges();
  }

  onStartVoiceClick() {
    if (!this.connected) {
      Swal.fire({ icon: 'info', title: this.translate.instant('CHAT.PARTNER'), text: this.translate.instant('CHAT.VOICE_NO_PARTNER'), confirmButtonText: this.translate.instant('HOME.ERROR_OK') }); return;
    }
    this.startRecording();
  }

  // ── Back button (mobile / browser) ────────────
  @HostListener('window:popstate', ['$event'])
  onPopState(event: PopStateEvent) {
    // Only intercept when chat is active (not on welcome screen)
    if (this.showWelcome) return;

    Swal.fire({
      icon: 'warning',
      title: this.translate.instant('CHAT.CONFIRM'),
      text: this.translate.instant('CHAT.STOP') + '?',
      showCancelButton: true,
      confirmButtonText: this.translate.instant('HOME.ERROR_OK'),
      cancelButtonText: this.translate.instant('CHAT.Cancel'),
      confirmButtonColor: '#f43f5e',
    }).then(result => {
      if (result.isConfirmed) {
        this.exitChat();
      } else {
        // User cancelled — push state back so back button works again next time
        history.pushState({ chatActive: true }, '');
      }
    });
  }

  onNextClick() {
    if (!this.confirmNext) {
      this.confirmNext = true; clearTimeout(this.confirmTimeout);
      this.confirmTimeout = setTimeout(() => { this.confirmNext = false; this.cd.detectChanges(); }, 2000); return;
    }
    this.confirmNext = false; clearTimeout(this.confirmTimeout); this.nextChat();
  }
  onExitClick() {
    if (!this.exitConfirm) {
      this.exitConfirm = true; clearTimeout(this.exitTimeout);
      this.exitTimeout = setTimeout(() => { this.exitConfirm = false; this.cd.detectChanges(); }, 2000); return;
    }
    this.exitConfirm = false; clearTimeout(this.exitTimeout); this.exitChat();
  }

  nextChat() {
    if (!this.socket) return;
    this.socket.emit('leave'); this.socket.disconnect();
    this.messages = []; this.connected = false; this.waiting = true;
    this.waitingMessageShown = false; this.partnerDisconnected = false; this.cd.detectChanges();
    fetch(`${environment.SayHello_Server}/start-chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: this.myName }) })
      .then(r => { if (!r.ok) throw 0; return r.json(); })
      .then(d => { this.token = d.token; setTimeout(() => this.initSocket(this.token), 500); })
      .catch(() => { Swal.fire({ icon: 'error', title: this.translate.instant('HOME.ERROR_INTERNET'), text: this.translate.instant('HOME.ERROR_SERVER'), confirmButtonText: this.translate.instant('HOME.ERROR_OK') }); this.router.navigate(['/']); });
  }

  exitChat() { this.socket?.disconnect(); this.router.navigate(['/']); }

  // ── Helpers ──────────────────────────────────
  private addSystemMessage(key: string) {
    this.messages.push({
      sender: 'system', key,
      status: ''
    }); this.scrollToBottom(); this.cd.detectChanges();
  }
  private scrollToBottom() { setTimeout(() => { if (this.chatBox) this.chatBox.nativeElement.scrollTop = this.chatBox.nativeElement.scrollHeight; }, 50); }
  private formatTime(iso: string): string {
    const d = new Date(iso); let h = d.getHours(); const m = d.getMinutes(); const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12; return `${h}:${m < 10 ? '0' + m : m} ${ap}`;
  }
  formatSeconds(s: number): string { const m = Math.floor(s / 60); const ss = (s % 60).toString().padStart(2, '0'); return `${m}:${ss}`; }
  generateUniqueId(): string { return 'msg-' + Math.random().toString(36).substr(2, 9); }
  getDisplayName(n: string | undefined): string { return (n || '').split('-')[0]; }

  /** WhatsApp-style grouping: show sender name only on first message in a consecutive group */
  isFirstInGroup(msg: ChatMessage, index: number): boolean {
    if (msg.sender !== 'user') return false;
    if (index === 0) return true;
    const prev = this.messages[index - 1];
    if (prev.sender !== 'user') return true;
    return prev.senderName !== msg.senderName;
  }
  private isMediaRecorderSupported(): boolean { return typeof MediaRecorder !== 'undefined'; }

  get confirmText(): string { return this.translate.instant('CHAT.CONFIRM'); }
  get isDarkMode(): boolean { return document.body.classList.contains('dark-mode'); }
  get isRtl(): boolean { return this.translate.currentLang === 'ar'; }

  ngOnDestroy() {
    this.socket?.disconnect();
    clearTimeout(this.typingTimeout); clearTimeout(this.confirmTimeout);
    clearTimeout(this.exitTimeout); clearTimeout(this.recordingTimeout);
    clearInterval(this.recordInterval); clearInterval(this.recordingPing);
    this.stopMicStream();
    // Close any open Swal dialogs to avoid memory leaks on destroy
    Swal.close();
  }
}

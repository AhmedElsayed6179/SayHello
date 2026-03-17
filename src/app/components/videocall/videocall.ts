import {
  Component, NgZone, OnInit, OnDestroy,
  ViewChild, ElementRef, ChangeDetectorRef, HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { io, Socket } from 'socket.io-client';
import Swal from 'sweetalert2';
import { ChatService } from '../../service/chat-service';
import { environment } from '../../environments/environment.development';
import { PickerModule } from '@ctrl/ngx-emoji-mart';
interface ChatMessage {
  id?: string;
  sender: 'user' | 'system';
  senderName?: string;
  text?: string;
  time?: string;
  key?: string;
  reactions?: { [emoji: string]: string[] };
  /** 'sending' | 'sent' | 'seen' */
  status?: 'sending' | 'sent' | 'seen';
}

@Component({
  selector: 'app-videocall',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, PickerModule],
  templateUrl: './videocall.html',
  styleUrls: ['./videocall.scss'],
})
export class Videocall implements OnInit, OnDestroy {
  @ViewChild('localVideo') localVideoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('chatBox') chatBoxRef!: ElementRef;

  socket!: Socket;
  token = '';
  myName = '';
  connected = false;
  waiting = false;
  showWelcome = true;
  isTyping = false;
  private typingTimeout: any;
  waitingMessageShown = false;
  partnerDisconnected = false;
  confirmNext = false;
  exitConfirm = false;
  private confirmTimeout: any;
  private exitTimeout: any;

  messages: ChatMessage[] = [];
  message = '';

  // Video/Audio state
  isMicOn = true;
  isCameraOn = true;
  localStream: MediaStream | null = null;
  private pc: RTCPeerConnection | null = null;
  remoteStreamActive = false;
  localVideoReady = false;
  private pendingRemoteStream: MediaStream | null = null;

  // Chat — CLOSED by default
  isChatOpen = false;
  unreadCount = 0;
  showEmoji = false;

  // PiP
  readonly isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  pipWidth = 130;
  pipHeight = 175;
  pipX = -1;
  pipY = -1;
  public isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private boundResizePip!: () => void;
  private iceCandidateQueue: RTCIceCandidateInit[] = [];

  // ── PiP size calc ──────────────────────────────
  private calcPipSize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const landscape = w > h;
    if (this.isMobile) {
      if (landscape) {
        this.pipWidth = Math.round(w * 0.20);
        this.pipHeight = Math.round(this.pipWidth * (9 / 16));
      } else {
        this.pipWidth = Math.round(w * 0.26);
        this.pipHeight = Math.round(this.pipWidth * (4 / 3));
      }
    } else {
      // Web — portrait camera aspect 3:4
      this.pipWidth = 140;
      this.pipHeight = Math.round(this.pipWidth * (4 / 3));
    }
    this.clampPip();
    this.cd.detectChanges();
  }

  private clampPip() {
    const ctrlH = this.isMobile ? 70 : 80;
    const maxX = window.innerWidth - this.pipWidth - 16;
    const maxY = window.innerHeight - this.pipHeight - ctrlH - 16;
    if (this.pipX < 0 || this.pipY < 0) {
      this.pipX = maxX;
      this.pipY = maxY;
    } else {
      this.pipX = Math.max(16, Math.min(this.pipX, maxX));
      this.pipY = Math.max(16, Math.min(this.pipY, maxY));
    }
  }

  // ── Drag (pointer events — works on mobile & desktop) ──
  onPipPointerDown(e: PointerEvent) {
    e.preventDefault();
    this.isDragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.dragOffsetX = e.clientX - this.pipX;
    this.dragOffsetY = e.clientY - this.pipY;
  }

  @HostListener('document:pointermove', ['$event'])
  onPointerMove(e: PointerEvent) {
    if (!this.isDragging) return;
    this.pipX = e.clientX - this.dragOffsetX;
    this.pipY = e.clientY - this.dragOffsetY;
    this.clampPip();
    this.cd.detectChanges();
  }

  @HostListener('document:pointerup')
  onPointerUp() { this.isDragging = false; }

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

    this.calcPipSize();
    this.boundResizePip = () => this.zone.run(() => this.calcPipSize());
    window.addEventListener('resize', this.boundResizePip);
    window.addEventListener('orientationchange', this.boundResizePip);

    document.getElementById('page-content')?.classList.add('videocall-active');
    document.querySelector('app-navbar')?.classList.add('d-none');
    document.getElementById('page-footer')?.classList.add('d-none');
    document.body.classList.add('in-videocall');
  }

  async startCall() {
    this.showWelcome = false;
    history.pushState({ chatActive: true }, '');
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      this.localVideoReady = true;
      this.cd.detectChanges();
      this.attachLocalStream();
    } catch (err) {
      Swal.fire({ icon: 'warning', title: 'Camera Error', text: 'Could not access camera/microphone.', confirmButtonText: 'OK' });
    }
    this.connectToServer();
  }

  private attachLocalStream() {
    const try_ = (n = 0) => {
      if (this.localVideoRef?.nativeElement && this.localStream) {
        this.localVideoRef.nativeElement.srcObject = this.localStream;
        this.localVideoRef.nativeElement.play().catch(() => { });
      } else if (n < 10) setTimeout(() => try_(n + 1), 100);
    };
    setTimeout(() => try_(), 50);
  }

  private attachRemoteStream(stream: MediaStream) {
    this.pendingRemoteStream = stream;
    if (!this.remoteStreamActive) { this.remoteStreamActive = true; this.cd.detectChanges(); }
    const try_ = (n = 0) => {
      const v = this.remoteVideoRef?.nativeElement;
      if (v) {
        v.srcObject = stream;
        v.play().catch(e => { console.warn(e); setTimeout(() => v.play().catch(() => { }), 500); });
        this.pendingRemoteStream = null;
      } else if (n < 30) setTimeout(() => try_(n + 1), 50);
    };
    setTimeout(() => try_(), 100);
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

    this.socket.on('connected', (data: { role: 'initiator' | 'answerer' }) => this.zone.run(async () => {
      this.connected = true; this.waiting = false; this.partnerDisconnected = false;
      const wi = this.messages.findIndex(m => m.key === 'CHAT.WAITING');
      if (wi !== -1) { this.messages.splice(wi, 1); this.waitingMessageShown = false; }
      this.addSystemMessage('CHAT.CONNECTED');
      await this.createPeerConnection();
      if (data?.role === 'initiator') {
        // Initiator creates offer — no artificial delay needed since PC is freshly created
        try {
          const offer = await this.pc!.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
          await this.pc!.setLocalDescription(offer);
          this.socket.emit('webrtc-offer', { sdp: offer });
        } catch (e) { console.error('createOffer error', e); }
      }
      // Answerer waits for the offer — createPeerConnection() is already done above
    }));

    this.socket.on('waiting', () => this.zone.run(() => {
      this.connected = false; this.waiting = true;
      if (!this.waitingMessageShown) { this.addSystemMessage('CHAT.WAITING'); this.waitingMessageShown = true; }
    }));

    this.socket.on('partner_left', () => this.zone.run(() => {
      this.connected = false; this.partnerDisconnected = true; this.remoteStreamActive = false;
      this.pendingRemoteStream = null; this.closePC();
      if (this.remoteVideoRef?.nativeElement) this.remoteVideoRef.nativeElement.srcObject = null;
      this.addSystemMessage('CHAT.PARTNER_LEFT'); this.cd.detectChanges();
    }));

    this.socket.on('user_count', (c: number) => this.zone.run(() => this.chatService.connectedUsers$.next(c)));

    this.socket.on('webrtc-offer', async (d: { sdp: RTCSessionDescriptionInit }) => {
      await this.zone.run(async () => {
        // Answerer already called createPeerConnection() on 'connected' event.
        // Only create a new PC if we don't have one yet (safety guard).
        if (!this.pc) await this.createPeerConnection();
        try {
          await this.pc!.setRemoteDescription(new RTCSessionDescription(d.sdp));
          // Flush any ICE candidates that arrived before remoteDescription was set
          if (this.iceCandidateQueue.length > 0) {
            const q = [...this.iceCandidateQueue]; this.iceCandidateQueue = [];
            for (const c of q) { try { await this.pc!.addIceCandidate(new RTCIceCandidate(c)); } catch { } }
          }
          const ans = await this.pc!.createAnswer();
          await this.pc!.setLocalDescription(ans);
          this.socket.emit('webrtc-answer', { sdp: ans });
        } catch (e) { console.error('webrtc-offer error', e); }
      });
    });

    this.socket.on('webrtc-answer', async (d: { sdp: RTCSessionDescriptionInit }) => {
      if (this.pc) await this.pc.setRemoteDescription(new RTCSessionDescription(d.sdp));
    });

    this.socket.on('webrtc-ice', async (d: { candidate: RTCIceCandidateInit }) => {
      try {
        if (this.pc && d.candidate) {
          if (this.pc.remoteDescription) await this.pc.addIceCandidate(new RTCIceCandidate(d.candidate));
          else this.iceCandidateQueue.push(d.candidate);
        }
      } catch (e) { console.warn('ICE', e); }
    });

    // ── Messages ──
    this.socket.on('newMessage', (msg: any) => this.zone.run(() => {
      if (!this.messages.find(m => m.id === msg.id)) {
        this.messages.push({
          id: msg.id, sender: 'user', senderName: msg.sender,
          text: msg.text, time: this.formatTime(msg.time), status: 'sent'
        });
        if (!this.isChatOpen) this.unreadCount++;
        // إرسال seen تلقائياً لو الشات مفتوح
        if (this.isChatOpen) this.socket.emit('messageSeen', { messageId: msg.id });
        this.scrollToBottom(); this.cd.detectChanges();
      }
    }));

    // تأكيد الرؤية من الطرف الآخر
    this.socket.on('messageSeen', (d: { messageId: string }) => this.zone.run(() => {
      const m = this.messages.find(x => x.id === d.messageId);
      if (m) { m.status = 'seen'; this.cd.detectChanges(); }
    }));

    this.socket.on('typing', () => this.zone.run(() => {
      this.isTyping = true; this.cd.detectChanges();
      clearTimeout(this.typingTimeout);
      this.typingTimeout = setTimeout(() => { this.isTyping = false; this.cd.detectChanges(); }, 1500);
    }));

    this.socket.on('newReaction', (d: any) => this.zone.run(() => {
      const m = this.messages.find(x => x.id === d.messageId);
      if (m) { m.reactions = d.reactions; this.cd.detectChanges(); }
    }));
  }

  private async createPeerConnection() {
    this.closePC(); this.iceCandidateQueue = [];
    let iceServers: RTCIceServer[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' }
    ];
    try {
      const r = await fetch(`${environment.SayHello_Server}/ice-servers`);
      if (r.ok) { const d = await r.json(); if (d.iceServers) iceServers = d.iceServers; }
    } catch { }
    this.pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 10 });

    // Add local tracks BEFORE creating offer/answer so they're included in SDP
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => this.pc!.addTrack(t, this.localStream!));
    }

    this.pc.ontrack = e => {
      const s = e.streams[0] || new MediaStream([e.track]);
      this.zone.run(() => this.attachRemoteStream(s));
    };

    this.pc.onicecandidate = e => {
      if (e.candidate) this.socket.emit('webrtc-ice', { candidate: e.candidate });
    };

    this.pc.onconnectionstatechange = () => {
      this.zone.run(() => {
        const s = this.pc?.connectionState;
        console.log('[WebRTC] connectionState:', s);
        if (s === 'connected') {
          // Stream is flowing — ensure UI reflects this
          this.cd.detectChanges();
        }
        if (s === 'disconnected' || s === 'failed' || s === 'closed') {
          this.remoteStreamActive = false;
          this.cd.detectChanges();
        }
      });
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] iceConnectionState:', this.pc?.iceConnectionState);
    };

    this.pc.onsignalingstatechange = async () => {
      if (this.pc?.signalingState === 'stable' && this.iceCandidateQueue.length > 0) {
        const q = [...this.iceCandidateQueue]; this.iceCandidateQueue = [];
        for (const c of q) { try { await this.pc.addIceCandidate(new RTCIceCandidate(c)); } catch { } }
      }
    };
  }

  private closePC() {
    if (this.pc) {
      this.pc.ontrack = null; this.pc.onicecandidate = null;
      this.pc.onconnectionstatechange = null; this.pc.onsignalingstatechange = null;
      this.pc.close(); this.pc = null;
    }
  }

  toggleMic() {
    if (!this.localStream) return;
    this.isMicOn = !this.isMicOn;
    this.localStream.getAudioTracks().forEach(t => t.enabled = this.isMicOn);
  }

  toggleCamera() {
    if (!this.localStream) return;
    this.isCameraOn = !this.isCameraOn;
    this.localStream.getVideoTracks().forEach(t => t.enabled = this.isCameraOn);
  }

  // ── Chat open/close ──
  openChat() {
    this.isChatOpen = true;
    this.unreadCount = 0;
    // علّم كل رسائل الشريك كـ seen
    this.messages.forEach(m => {
      if (m.sender === 'user' && m.senderName !== this.myName && m.id)
        this.socket?.emit('messageSeen', { messageId: m.id });
    });
    this.scrollToBottom();
  }

  toggleChat() { this.isChatOpen ? this.isChatOpen = false : this.openChat(); }

  sendMessage() {
    if (!this.connected || this.partnerDisconnected) {
      Swal.fire({ icon: 'info', title: this.translate.instant('CHAT.PARTNER'), text: this.translate.instant('CHAT.message_NO_PARTNER'), confirmButtonText: this.translate.instant('HOME.ERROR_OK') });
      return;
    }
    const text = this.message.trim();
    if (!text) return;
    const id = 'msg-' + Math.random().toString(36).substr(2, 9);
    const msg: ChatMessage = { id, sender: 'user', senderName: this.myName, text, time: this.formatTime(new Date().toISOString()), status: 'sending' };
    this.messages.push(msg);
    this.socket.emit('sendMessage', { id, text });
    this.message = '';
    this.scrollToBottom(); this.cd.detectChanges();
    setTimeout(() => { const m = this.messages.find(x => x.id === id); if (m && m.status === 'sending') { m.status = 'sent'; this.cd.detectChanges(); } }, 600);
  }

  onTyping() { if (this.connected) this.socket.emit('typing'); }
  reactToMessage(msg: ChatMessage, reaction: string) { if (msg.id) this.socket.emit('react', { messageId: msg.id, reaction, sender: this.myName }); }

  onEmojiSelect(event: any) {
    this.message += event.emoji?.native ?? event.emoji?.colons ?? '';
    this.showEmoji = false;
    this.cd.detectChanges();
  }
  toggleEmoji() {
    this.showEmoji = !this.showEmoji;
    this.cd.detectChanges();
  }

  @HostListener('window:popstate', ['$event'])
  onPopState(event: PopStateEvent) {
    Swal.fire({
      icon: 'warning',
      title: this.translate.instant('CHAT.CONFIRM'),
      text: this.translate.instant('CHAT.STOP') + '?',
      showCancelButton: true,
      confirmButtonText: this.translate.instant('HOME.ERROR_OK'),
      cancelButtonText: this.translate.instant('CHAT.Cancel'),
    }).then(result => {
      if (result.isConfirmed) {
        this.exitCall();
      } else {
        history.pushState({ chatActive: true }, '');
      }
    });
  }

  onNextClick() {
    if (!this.confirmNext) { this.confirmNext = true; clearTimeout(this.confirmTimeout); this.confirmTimeout = setTimeout(() => { this.confirmNext = false; this.cd.detectChanges(); }, 2000); return; }
    this.confirmNext = false; clearTimeout(this.confirmTimeout); this.nextCall();
  }

  onExitClick() {
    if (!this.exitConfirm) { this.exitConfirm = true; clearTimeout(this.exitTimeout); this.exitTimeout = setTimeout(() => { this.exitConfirm = false; this.cd.detectChanges(); }, 2000); return; }
    this.exitConfirm = false; clearTimeout(this.exitTimeout); this.exitCall();
  }

  nextCall() {
    this.closePC(); this.remoteStreamActive = false; this.pendingRemoteStream = null; this.iceCandidateQueue = [];
    if (this.remoteVideoRef?.nativeElement) this.remoteVideoRef.nativeElement.srcObject = null;
    if (this.socket) { this.socket.emit('leave'); this.socket.disconnect(); }
    this.messages = []; this.connected = false; this.waiting = true;
    this.waitingMessageShown = false; this.partnerDisconnected = false; this.unreadCount = 0;
    this.cd.detectChanges();
    fetch(`${environment.SayHello_Server}/start-chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: this.myName }) })
      .then(r => { if (!r.ok) throw 0; return r.json(); })
      .then(d => { this.token = d.token; setTimeout(() => this.initSocket(this.token), 500); })
      .catch(() => this.router.navigate(['/']));
  }

  exitCall() { this.cleanupMedia(); this.socket?.disconnect(); this.router.navigate(['/']); }

  private cleanupMedia() {
    this.closePC();
    if (this.localStream) { this.localStream.getTracks().forEach(t => t.stop()); this.localStream = null; }
    this.localVideoReady = false;
  }

  private addSystemMessage(key: string) { this.messages.push({ sender: 'system', key }); this.scrollToBottom(); this.cd.detectChanges(); }

  private scrollToBottom() {
    setTimeout(() => { if (this.chatBoxRef?.nativeElement) this.chatBoxRef.nativeElement.scrollTop = this.chatBoxRef.nativeElement.scrollHeight; }, 50);
  }

  private formatTime(iso: string): string {
    const d = new Date(iso); let h = d.getHours(); const m = d.getMinutes(); const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12; return `${h}:${m < 10 ? '0' + m : m} ${ap}`;
  }

  getDisplayName(name: string): string { return (name || '').replace(/-\d{6}$/, ''); }
  get confirmText(): string { return this.translate.instant('CHAT.CONFIRM'); }
  get isDarkMode(): boolean { return document.body.classList.contains('dark-mode'); }
  get isRtl(): boolean { return this.translate.currentLang === 'ar'; }

  ngOnDestroy() {
    document.querySelector('app-navbar')?.classList.remove('d-none');
    document.getElementById('page-footer')?.classList.remove('d-none');
    document.getElementById('page-content')?.classList.remove('videocall-active');
    document.body.classList.remove('in-videocall');
    this.cleanupMedia(); this.socket?.emit('leave'); this.socket?.disconnect();
    clearTimeout(this.typingTimeout); clearTimeout(this.confirmTimeout); clearTimeout(this.exitTimeout);
    if (this.boundResizePip) { window.removeEventListener('resize', this.boundResizePip); window.removeEventListener('orientationchange', this.boundResizePip); }
  }
}

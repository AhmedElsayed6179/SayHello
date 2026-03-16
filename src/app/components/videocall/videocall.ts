import {
  Component, NgZone, OnInit, OnDestroy,
  ViewChild, ElementRef, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { io, Socket } from 'socket.io-client';
import Swal from 'sweetalert2';
import { ChatService } from '../../service/chat-service';
import { environment } from '../../environments/environment.development';

interface ChatMessage {
  id?: string;
  sender: 'user' | 'system';
  senderName?: string;
  text?: string;
  time?: string;
  key?: string;
  reactions?: { [emoji: string]: string[] };
}

@Component({
  selector: 'app-videocall',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './videocall.html',
  styleUrls: ['./videocall.scss']
})
export class Videocall implements OnInit, OnDestroy {
  @ViewChild('localVideo')  localVideoRef!:  ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('chatBox')     chatBoxRef!:     ElementRef;
  @ViewChild('localPip')    localPipRef!:    ElementRef<HTMLDivElement>;

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

  // UI
  isChatOpen = false;

  // ── PiP drag state ────────────────────────────
  readonly isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  pipPos  = { right: 20, bottom: 100 }; // default position (px from edges)
  private isDragging  = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private boundMouseMove!: (e: MouseEvent) => void;
  private boundMouseUp!:   (e: MouseEvent) => void;
  private boundTouchMove!: (e: TouchEvent) => void;
  private boundTouchEnd!:  (e: TouchEvent) => void;

  constructor(
    private route: ActivatedRoute,
    private zone: NgZone,
    private translate: TranslateService,
    private cd: ChangeDetectorRef,
    private router: Router,
    private chatService: ChatService
  ) { }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.token = params['token'];
    });
    this.myName = history.state?.name;

    if (!this.token || !this.myName) {
      this.router.navigate(['/']);
      return;
    }

    // إخفاء الـ navbar والـ footer عشان الصفحة full screen
    document.getElementById('page-content')?.classList.add('videocall-active');
    document.querySelector('app-navbar')?.classList.add('d-none');
    document.getElementById('page-footer')?.classList.add('d-none');
    // إضافة كلاس على الـ body عشان نعرف إننا في صفحة الفيديو
    document.body.classList.add('in-videocall');
  }

  async startCall() {
    this.showWelcome = false;

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      });
      this.localVideoReady = true;
      this.cd.detectChanges();
      this.attachLocalStream();
    } catch (err) {
      console.error('Camera error:', err);
      Swal.fire({
        icon: 'warning',
        title: 'Camera Error',
        text: 'Could not access camera/microphone. Please check permissions.',
        confirmButtonText: 'OK'
      });
    }

    this.connectToServer();
  }

  private attachLocalStream() {
    const tryAttach = (attempts = 0) => {
      if (this.localVideoRef?.nativeElement && this.localStream) {
        const video = this.localVideoRef.nativeElement;
        video.srcObject = this.localStream;
        video.play().catch(() => { });
      } else if (attempts < 10) {
        setTimeout(() => tryAttach(attempts + 1), 100);
      }
    };
    setTimeout(() => tryAttach(), 50);
  }

  private attachRemoteStream(stream: MediaStream) {
    this.pendingRemoteStream = stream;

    // ✅ Step 1: أظهر الـ video element أولاً عبر Angular
    if (!this.remoteStreamActive) {
      this.remoteStreamActive = true;
      this.cd.detectChanges();
    }

    // ✅ Step 2: بعد ما Angular يرسم العنصر ويطبق visible class، اربط الـ stream
    const tryAttach = (attempts = 0) => {
      const video = this.remoteVideoRef?.nativeElement;
      if (video) {
        video.srcObject = stream;
        // الـ visibility يتحكم فيها Angular عبر [class.visible] + opacity في SCSS
        const playPromise = video.play();
        if (playPromise) {
          playPromise.catch(e => {
            console.warn('Remote video play error:', e);
            setTimeout(() => video.play().catch(() => { }), 500);
          });
        }
        this.pendingRemoteStream = null;
      } else if (attempts < 30) {
        setTimeout(() => tryAttach(attempts + 1), 50);
      }
    };
    // نعطي Angular وقت كافي يرسم العنصر بعد detectChanges
    setTimeout(() => tryAttach(), 100);
  }

  connectToServer() {
    fetch(`${environment.SayHello_Server}/start-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: this.myName })
    })
      .then(res => { if (!res.ok) throw new Error('Failed'); return res.json(); })
      .then(data => this.initSocket(data.token))
      .catch(() => {
        Swal.fire('Error', 'Failed to connect', 'error');
        this.router.navigate(['/']);
      });
  }

  initSocket(token: string) {
    if (this.socket) {
      this.socket.emit('leave');
      this.socket.disconnect();
    }

    this.socket = io(`${environment.SayHello_Server}`, { transports: ['websocket'] });
    this.socket.emit('join', token);

    // ─── Matchmaking ───────────────────────────────────────────────
    this.socket.on('connected', (data: { role: 'initiator' | 'answerer' }) => this.zone.run(async () => {
      this.connected = true;
      this.waiting = false;
      this.partnerDisconnected = false;

      const waitIdx = this.messages.findIndex(m => m.key === 'CHAT.WAITING');
      if (waitIdx !== -1) { this.messages.splice(waitIdx, 1); this.waitingMessageShown = false; }

      this.addSystemMessage('CHAT.CONNECTED');

      await this.createPeerConnection();

      // ✅ فقط الـ initiator يبعت offer — الـ answerer ينتظر
      if (data?.role === 'initiator') {
        await new Promise(resolve => setTimeout(resolve, 300));
        const offer = await this.pc!.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        await this.pc!.setLocalDescription(offer);
        this.socket.emit('webrtc-offer', { sdp: offer });
      }
    }));

    this.socket.on('waiting', () => this.zone.run(() => {
      this.connected = false;
      this.waiting = true;
      if (!this.waitingMessageShown) {
        this.addSystemMessage('CHAT.WAITING');
        this.waitingMessageShown = true;
      }
    }));

    this.socket.on('partner_left', () => this.zone.run(() => {
      this.connected = false;
      this.partnerDisconnected = true;
      this.remoteStreamActive = false;
      this.pendingRemoteStream = null;
      this.closePC();
      if (this.remoteVideoRef?.nativeElement) {
        this.remoteVideoRef.nativeElement.srcObject = null;
      }
      this.addSystemMessage('CHAT.PARTNER_LEFT');
      this.cd.detectChanges();
    }));

    this.socket.on('user_count', (count: number) => this.zone.run(() => {
      this.chatService.connectedUsers$.next(count);
    }));

    // ─── WebRTC Signaling ───────────────────────────────────────────

    // ✅ الـ Answerer: بنعمل pc ونرد بـ answer (بدون closePC هنا!)
    this.socket.on('webrtc-offer', async (data: { sdp: RTCSessionDescriptionInit }) => {
      await this.zone.run(async () => {
        await this.createPeerConnection();
        await this.pc!.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await this.pc!.createAnswer();
        await this.pc!.setLocalDescription(answer);
        this.socket.emit('webrtc-answer', { sdp: answer });
      });
    });

    this.socket.on('webrtc-answer', async (data: { sdp: RTCSessionDescriptionInit }) => {
      if (this.pc) {
        await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      }
    });

    // ✅ ICE candidates — بنحطهم في queue لو الـ remote description لسه مجتش
    this.socket.on('webrtc-ice', async (data: { candidate: RTCIceCandidateInit }) => {
      try {
        if (this.pc && data.candidate) {
          if (this.pc.remoteDescription) {
            await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } else {
            // احتفظ بالـ candidate في queue لحد ما الـ remote description تيجي
            this.iceCandidateQueue.push(data.candidate);
          }
        }
      } catch (e) { console.warn('ICE error:', e); }
    });

    // ─── Chat Messages ──────────────────────────────────────────────
    this.socket.on('newMessage', (msg: any) => this.zone.run(() => {
      if (!this.messages.find(m => m.id === msg.id)) {
        this.messages.push({
          id: msg.id, sender: 'user',
          senderName: msg.sender,
          text: msg.text,
          time: this.formatTime(msg.time)
        });
        this.scrollToBottom();
        this.cd.detectChanges();
      }
    }));

    this.socket.on('typing', () => this.zone.run(() => {
      this.isTyping = true;
      this.cd.detectChanges();
      clearTimeout(this.typingTimeout);
      this.typingTimeout = setTimeout(() => {
        this.isTyping = false;
        this.cd.detectChanges();
      }, 1500);
    }));

    this.socket.on('newReaction', (data: any) => this.zone.run(() => {
      const msg = this.messages.find(m => m.id === data.messageId);
      if (msg) { msg.reactions = data.reactions; this.cd.detectChanges(); }
    }));
  }

  // ─── ICE candidate queue (لو جت قبل setRemoteDescription) ────────
  private iceCandidateQueue: RTCIceCandidateInit[] = [];

  // ✅ دالة موحدة لإنشاء الـ RTCPeerConnection
  private async createPeerConnection() {
    this.closePC();
    this.iceCandidateQueue = [];

    // ✅ جيب الـ ICE servers من السيرفر
    let iceServers: RTCIceServer[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];

    try {
      const res = await fetch(`${environment.SayHello_Server}/ice-servers`);
      if (res.ok) {
        const data = await res.json();
        if (data.iceServers) iceServers = data.iceServers;
      }
    } catch (e) {
      console.warn('Could not fetch ICE servers, using defaults');
    }

    const config: RTCConfiguration = {
      iceServers,
      iceCandidatePoolSize: 10
    };

    this.pc = new RTCPeerConnection(config);

    // ✅ إضافة الـ local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.pc!.addTrack(track, this.localStream!);
      });
    }

    // ✅ استقبال الـ remote stream
    this.pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;

      this.zone.run(() => {
        // attachRemoteStream تتكفل بكل شيء: set remoteStreamActive + attach
        this.attachRemoteStream(stream);
      });
    };

    // ✅ إرسال ICE candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('webrtc-ice', { candidate: event.candidate });
      }
    };

    // ✅ معالجة تغيير الـ connection state
    this.pc.onconnectionstatechange = () => {
      this.zone.run(() => {
        const state = this.pc?.connectionState;
        console.log('WebRTC connection state:', state);
        if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          this.remoteStreamActive = false;
          this.cd.detectChanges();
        }
      });
    };

    // ✅ بعد setRemoteDescription، نطبق الـ ICE candidates المعلقة
    this.pc.onsignalingstatechange = async () => {
      if (this.pc?.signalingState === 'stable' && this.iceCandidateQueue.length > 0) {
        const queue = [...this.iceCandidateQueue];
        this.iceCandidateQueue = [];
        for (const candidate of queue) {
          try {
            await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) { }
        }
      }
    };
  }

  private closePC() {
    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.onicecandidate = null;
      this.pc.onconnectionstatechange = null;
      this.pc.onsignalingstatechange = null;
      this.pc.close();
      this.pc = null;
    }
  }

  // ─── Media Controls ───────────────────────────────────────────────
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

  // ─── Chat ─────────────────────────────────────────────────────────
  sendMessage() {
    if (!this.connected || this.partnerDisconnected) {
      Swal.fire({
        icon: 'info',
        title: this.translate.instant('CHAT.PARTNER'),
        text: this.translate.instant('CHAT.message_NO_PARTNER'),
        confirmButtonText: this.translate.instant('HOME.ERROR_OK')
      });
      return;
    }
    const text = this.message.trim();
    if (!text) return;

    const chatMsg: ChatMessage = {
      id: this.generateId(),
      sender: 'user',
      senderName: this.myName,
      text,
      time: this.formatTime(new Date().toISOString())
    };
    this.messages.push(chatMsg);
    this.socket.emit('sendMessage', { id: chatMsg.id, text });
    this.message = '';
    this.scrollToBottom();
    this.cd.detectChanges();
  }

  onTyping() {
    if (this.connected) this.socket.emit('typing');
  }

  reactToMessage(msg: ChatMessage, reaction: string) {
    if (!msg.id) return;
    this.socket.emit('react', { messageId: msg.id, reaction, sender: this.myName });
  }

  // ─── Navigation ───────────────────────────────────────────────────
  onNextClick() {
    if (!this.confirmNext) {
      this.confirmNext = true;
      clearTimeout(this.confirmTimeout);
      this.confirmTimeout = setTimeout(() => { this.confirmNext = false; this.cd.detectChanges(); }, 2000);
      return;
    }
    this.confirmNext = false;
    clearTimeout(this.confirmTimeout);
    this.nextCall();
  }

  onExitClick() {
    if (!this.exitConfirm) {
      this.exitConfirm = true;
      clearTimeout(this.exitTimeout);
      this.exitTimeout = setTimeout(() => { this.exitConfirm = false; this.cd.detectChanges(); }, 2000);
      return;
    }
    this.exitConfirm = false;
    clearTimeout(this.exitTimeout);
    this.exitCall();
  }

  nextCall() {
    this.closePC();
    this.remoteStreamActive = false;
    this.pendingRemoteStream = null;
    this.iceCandidateQueue = [];

    if (this.remoteVideoRef?.nativeElement) {
      this.remoteVideoRef.nativeElement.srcObject = null;
    }

    if (this.socket) { this.socket.emit('leave'); this.socket.disconnect(); }

    this.messages = [];
    this.connected = false;
    this.waiting = true;
    this.waitingMessageShown = false;
    this.partnerDisconnected = false;
    this.cd.detectChanges();

    fetch(`${environment.SayHello_Server}/start-chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: this.myName })
    })
      .then(res => { if (!res.ok) throw new Error(''); return res.json(); })
      .then(data => { this.token = data.token; setTimeout(() => this.initSocket(this.token), 500); })
      .catch(() => { this.router.navigate(['/']); });
  }

  exitCall() {
    this.cleanupMedia();
    this.socket?.disconnect();
    this.router.navigate(['/']);
  }

  private cleanupMedia() {
    this.closePC();
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    this.localVideoReady = false;
  }

  // ─── Helpers ──────────────────────────────────────────────────────
  private addSystemMessage(key: string) {
    this.messages.push({ sender: 'system', key });
    this.scrollToBottom();
    this.cd.detectChanges();
  }

  private scrollToBottom() {
    setTimeout(() => {
      if (this.chatBoxRef?.nativeElement) {
        this.chatBoxRef.nativeElement.scrollTop = this.chatBoxRef.nativeElement.scrollHeight;
      }
    }, 50);
  }

  private formatTime(isoTime: string): string {
    const date = new Date(isoTime);
    let h = date.getHours();
    const m = date.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m < 10 ? '0' + m : m} ${ampm}`;
  }

  private generateId(): string {
    return 'msg-' + Math.random().toString(36).substr(2, 9);
  }

  getDisplayName(name: string): string {
    if (!name) return '';
    return name.replace(/-\d{6}$/, '');
  }

  get confirmText(): string { return this.translate.instant('CHAT.CONFIRM'); }
  get isDarkMode(): boolean { return document.body.classList.contains('dark-mode'); }
  get isRtl(): boolean { return this.translate.currentLang === 'ar'; }

  // ─── PiP Drag (Mouse + Touch) ─────────────────────────────────────

  /** يُحسب حجم الـ PiP حسب نوع الجهاز */
  get pipSize(): { width: number; height: number } {
    const landscape = window.innerWidth > window.innerHeight;
    if (this.isMobile) {
      return landscape
        ? { width: 128, height: 72  }   // landscape → 16:9
        : { width: 90,  height: 120 };  // portrait  → 3:4
    }
    return { width: 120, height: 160 }; // desktop   → 3:4
  }

  /** style binding للـ PiP div */
  get pipStyle(): Record<string, string> {
    const { width, height } = this.pipSize;
    return {
      position: 'absolute',
      width:    width  + 'px',
      height:   height + 'px',
      right:    this.pipPos.right  + 'px',
      bottom:   this.pipPos.bottom + 'px',
      left:     'auto',
      top:      'auto',
      cursor:   this.isDragging ? 'grabbing' : 'grab',
      transition: this.isDragging ? 'none' : 'box-shadow 0.2s, width 0.3s, height 0.3s'
    };
  }

  onPipMouseDown(e: MouseEvent) {
    e.preventDefault();
    this.startDrag(e.clientX, e.clientY);
    this.boundMouseMove = (ev: MouseEvent) => this.onDragMove(ev.clientX, ev.clientY);
    this.boundMouseUp   = () => this.stopDrag();
    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mouseup',   this.boundMouseUp);
  }

  onPipTouchStart(e: TouchEvent) {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    this.startDrag(t.clientX, t.clientY);
    this.boundTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length) this.onDragMove(ev.touches[0].clientX, ev.touches[0].clientY);
    };
    this.boundTouchEnd = () => this.stopDrag();
    document.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    document.addEventListener('touchend',  this.boundTouchEnd);
  }

  private startDrag(clientX: number, clientY: number) {
    this.isDragging = true;
    const pip = this.localPipRef?.nativeElement;
    if (!pip) return;
    const rect = pip.getBoundingClientRect();
    // offset من الزاوية السفلية اليمنى لأننا بنستخدم right/bottom
    this.dragOffsetX = window.innerWidth  - clientX - (window.innerWidth  - rect.right);
    this.dragOffsetY = window.innerHeight - clientY - (window.innerHeight - rect.bottom);
  }

  private onDragMove(clientX: number, clientY: number) {
    if (!this.isDragging) return;
    const { width, height } = this.pipSize;
    const margin = 8;
    let right  = window.innerWidth  - clientX - this.dragOffsetX;
    let bottom = window.innerHeight - clientY - this.dragOffsetY;

    // حدود الشاشة
    right  = Math.max(margin, Math.min(right,  window.innerWidth  - width  - margin));
    bottom = Math.max(margin, Math.min(bottom, window.innerHeight - height - margin));

    this.zone.run(() => {
      this.pipPos = { right, bottom };
      this.cd.detectChanges();
    });
  }

  private stopDrag() {
    if (!this.isDragging) return;
    this.isDragging = false;

    // Snap لأقرب corner
    this.zone.run(() => {
      this.snapToNearestCorner();
      this.cd.detectChanges();
    });

    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup',   this.boundMouseUp);
    document.removeEventListener('touchmove', this.boundTouchMove);
    document.removeEventListener('touchend',  this.boundTouchEnd);
  }

  private snapToNearestCorner() {
    const { width, height } = this.pipSize;
    const margin  = 16;
    const ctrlH   = this.isMobile ? 70 : 80; // ارتفاع شريط الأزرار
    const corners = [
      { right: margin,                              bottom: ctrlH + margin },          // bottom-right
      { right: window.innerWidth - width - margin,  bottom: ctrlH + margin },          // bottom-left
      { right: margin,                              bottom: window.innerHeight - height - margin }, // top-right
      { right: window.innerWidth - width - margin,  bottom: window.innerHeight - height - margin } // top-left
    ];

    // أقرب corner للموضع الحالي
    let best = corners[0];
    let bestDist = Infinity;
    for (const c of corners) {
      const dx = c.right  - this.pipPos.right;
      const dy = c.bottom - this.pipPos.bottom;
      const d  = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = c; }
    }
    this.pipPos = best;
  }

  ngOnDestroy() {
    document.querySelector('app-navbar')?.classList.remove('d-none');
    document.getElementById('page-footer')?.classList.remove('d-none');
    document.getElementById('page-content')?.classList.remove('videocall-active');
    document.body.classList.remove('in-videocall');

    this.cleanupMedia();
    this.socket?.emit('leave');
    this.socket?.disconnect();
    clearTimeout(this.typingTimeout);
    clearTimeout(this.confirmTimeout);
    clearTimeout(this.exitTimeout);

    if (this.boundMouseMove) document.removeEventListener('mousemove', this.boundMouseMove);
    if (this.boundMouseUp)   document.removeEventListener('mouseup',   this.boundMouseUp);
    if (this.boundTouchMove) document.removeEventListener('touchmove', this.boundTouchMove);
    if (this.boundTouchEnd)  document.removeEventListener('touchend',  this.boundTouchEnd);
  }
}

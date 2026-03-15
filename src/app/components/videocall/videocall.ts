import {
  Component, NgZone, OnInit, OnDestroy,
  ViewChild, ElementRef, ChangeDetectorRef, AfterViewInit
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

  // Stores the remote stream so we can attach it whenever the view is ready
  private pendingRemoteStream: MediaStream | null = null;

  // UI
  isChatOpen = true;

  constructor(
    private route: ActivatedRoute,
    private zone: NgZone,
    private translate: TranslateService,
    private cd: ChangeDetectorRef,
    private router: Router,
    private chatService: ChatService
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.token = params['token'];
    });
    this.myName = history.state?.name;

    if (!this.token || !this.myName) {
      this.router.navigate(['/']);
    }
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

      // Attach local stream after view renders
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
        video.play().catch(() => {});
      } else if (attempts < 10) {
        setTimeout(() => tryAttach(attempts + 1), 100);
      }
    };
    setTimeout(() => tryAttach(), 50);
  }

  private attachRemoteStream(stream: MediaStream) {
    this.pendingRemoteStream = stream;
    const tryAttach = (attempts = 0) => {
      if (this.remoteVideoRef?.nativeElement) {
        const video = this.remoteVideoRef.nativeElement;
        video.srcObject = stream;
        video.play().catch(e => console.warn('Remote video play error:', e));
        this.pendingRemoteStream = null;
      } else if (attempts < 20) {
        setTimeout(() => tryAttach(attempts + 1), 100);
      }
    };
    setTimeout(() => tryAttach(), 50);
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
    this.socket.on('connected', () => this.zone.run(async () => {
      this.connected = true;
      this.waiting = false;
      this.partnerDisconnected = false;

      const waitIdx = this.messages.findIndex(m => m.key === 'CHAT.WAITING');
      if (waitIdx !== -1) { this.messages.splice(waitIdx, 1); this.waitingMessageShown = false; }

      this.addSystemMessage('CHAT.CONNECTED');
      await this.startWebRTC(true); // Initiator
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
      // Clear remote video
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
    this.socket.on('webrtc-offer', async (data: { sdp: RTCSessionDescriptionInit }) => {
      await this.zone.run(async () => {
        await this.startWebRTC(false);
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

    this.socket.on('webrtc-ice', async (data: { candidate: RTCIceCandidateInit }) => {
      try {
        if (this.pc && data.candidate) {
          await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch (e) {}
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

  // ─── WebRTC Setup ─────────────────────────────────────────────────
  private async startWebRTC(isInitiator: boolean) {
    this.closePC();

    const config: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    };

    this.pc = new RTCPeerConnection(config);

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.pc!.addTrack(track, this.localStream!);
      });
    }

    // ── Remote stream handler — KEY FIX ──
    // We use a single MediaStream and collect all incoming tracks
    const remoteStream = new MediaStream();

    this.pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach(track => {
        remoteStream.addTrack(track);
      });

      this.zone.run(() => {
        // Attach the stream to the video element
        this.attachRemoteStream(event.streams[0] || remoteStream);

        // Mark as active only when we actually have video or audio
        if (!this.remoteStreamActive) {
          this.remoteStreamActive = true;
          this.cd.detectChanges();
        }
      });
    };

    // ICE candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('webrtc-ice', { candidate: event.candidate });
      }
    };

    this.pc.onconnectionstatechange = () => {
      this.zone.run(() => {
        const state = this.pc?.connectionState;
        console.log('WebRTC connection state:', state);

        if (state === 'connected') {
          // Stream should already be active from ontrack
          this.cd.detectChanges();
        } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          this.remoteStreamActive = false;
          this.cd.detectChanges();
        }
      });
    };

    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc?.iceConnectionState;
      console.log('ICE connection state:', state);
    };

    if (isInitiator) {
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await this.pc.setLocalDescription(offer);
      this.socket.emit('webrtc-offer', { sdp: offer });
    }
  }

  private closePC() {
    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.onicecandidate = null;
      this.pc.onconnectionstatechange = null;
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

    // Clear remote video
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

  ngOnDestroy() {
    this.cleanupMedia();
    this.socket?.disconnect();
    clearTimeout(this.typingTimeout);
    clearTimeout(this.confirmTimeout);
    clearTimeout(this.exitTimeout);
  }
}

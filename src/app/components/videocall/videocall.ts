import {
  Component, NgZone, OnInit, OnDestroy,
  ViewChild, ElementRef, ChangeDetectorRef, CUSTOM_ELEMENTS_SCHEMA
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { io, Socket } from 'socket.io-client';
import Swal from 'sweetalert2';
import { environment } from '../../environments/environment.development';

interface ChatMsg {
  id: string;
  sender: 'user' | 'system';
  senderName?: string;
  text?: string;
  time?: string;
  key?: string;
}

@Component({
  selector: 'app-videocall',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './videocall.html',
  styleUrls: ['./videocall.scss']
})
export class Videocall implements OnInit, OnDestroy {
  @ViewChild('localVideo') localVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('chatBox') chatBox!: ElementRef;

  socket!: Socket;
  messages: ChatMsg[] = [];
  message = '';
  myName = '';
  token = '';

  connected = false;
  waiting = false;
  showWelcome = true;
  isTyping = false;
  partnerDisconnected = false;
  waitingMessageShown = false;

  isMicMuted = false;
  isCamOff = false;
  localStream: MediaStream | null = null;

  private peerConnection: RTCPeerConnection | null = null;
  private typingTimeout: any;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteDescSet = false;

  private readonly iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  sendSound = new Audio('sendSound.mp3');

  constructor(
    private route: ActivatedRoute,
    private zone: NgZone,
    private translate: TranslateService,
    private cd: ChangeDetectorRef,
    private router: Router
  ) { }

  ngOnInit() {
    this.route.queryParams.subscribe(p => { this.token = p['token']; });
    this.myName = history.state?.name;
    if (!this.token || !this.myName) this.router.navigate(['/']);
  }

  // ─── Start ────────────────────────────────────────────────────────────────
  startCall() {
    this.showWelcome = false;
    this.initMedia().then(() => this.connectToServer());
  }

  private async initMedia() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      this.cd.detectChanges();
      setTimeout(() => {
        if (this.localVideo?.nativeElement) {
          this.localVideo.nativeElement.srcObject = this.localStream;
        }
      }, 100);
    } catch {
      Swal.fire({
        icon: 'warning',
        title: this.translate.instant('VIDEOCALL.CAM_ERROR_TITLE'),
        text: this.translate.instant('VIDEOCALL.CAM_ERROR_DESC')
      });
    }
  }

  private connectToServer() {
    fetch(`${environment.SayHello_Server}/start-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: this.myName })
    })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => this.initSocket(d.token))
      .catch(() => {
        Swal.fire('Error', 'Failed to connect', 'error');
        this.router.navigate(['/']);
      });
  }

  // ─── Socket ───────────────────────────────────────────────────────────────
  private initSocket(token: string) {
    if (this.socket) { this.socket.emit('leave'); this.socket.disconnect(); }

    this.socket = io(`${environment.SayHello_Server}`, { transports: ['websocket'] });
    this.socket.emit('join', token);

    this.socket.on('waiting', () => this.zone.run(() => {
      this.connected = false; this.waiting = true;
      if (!this.waitingMessageShown) {
        this.addSysMsg('CHAT.WAITING');
        this.waitingMessageShown = true;
      }
    }));

    this.socket.on('connected', () => this.zone.run(async () => {
      this.connected = true; this.waiting = false;
      const wIdx = this.messages.findIndex(m => m.key === 'CHAT.WAITING');
      if (wIdx !== -1) { this.messages.splice(wIdx, 1); this.waitingMessageShown = false; }
      this.addSysMsg('CHAT.CONNECTED');
      // Initiator creates offer
      await this.setupPeer(true);
    }));

    this.socket.on('partner_left', () => this.zone.run(() => {
      this.connected = false; this.partnerDisconnected = true;
      this.addSysMsg('CHAT.PARTNER_LEFT');
      this.cleanupPeer();
      this.cd.detectChanges();
    }));

    // ── WebRTC signaling ──
    this.socket.on('vc-offer', async (offer: RTCSessionDescriptionInit) => {
      this.zone.run(async () => {
        await this.setupPeer(false);
        await this.peerConnection!.setRemoteDescription(offer);
        this.remoteDescSet = true;
        await this.flushCandidates();
        const answer = await this.peerConnection!.createAnswer();
        await this.peerConnection!.setLocalDescription(answer);
        this.socket.emit('vc-answer', answer);
      });
    });

    this.socket.on('vc-answer', async (answer: RTCSessionDescriptionInit) => {
      this.zone.run(async () => {
        if (this.peerConnection) {
          await this.peerConnection.setRemoteDescription(answer);
          this.remoteDescSet = true;
          await this.flushCandidates();
        }
      });
    });

    this.socket.on('vc-ice', async (candidate: RTCIceCandidateInit) => {
      this.zone.run(async () => {
        if (this.remoteDescSet && this.peerConnection) {
          try { await this.peerConnection.addIceCandidate(candidate); } catch { }
        } else {
          this.pendingCandidates.push(candidate);
        }
      });
    });

    // ── Chat ──
    this.socket.on('newMessage', msg => this.zone.run(() => {
      if (!this.messages.find(m => m.id === msg.id)) {
        this.messages.push({
          id: msg.id, sender: 'user',
          senderName: msg.sender, text: msg.text,
          time: this.formatTime(msg.time)
        });
        this.scrollToBottom();
      }
      this.cd.detectChanges();
    }));

    this.socket.on('typing', () => this.zone.run(() => {
      this.isTyping = true; this.cd.detectChanges();
      clearTimeout(this.typingTimeout);
      this.typingTimeout = setTimeout(() => { this.isTyping = false; this.cd.detectChanges(); }, 1000);
    }));
  }

  // ─── WebRTC Peer ──────────────────────────────────────────────────────────
  private async setupPeer(isInitiator: boolean) {
    this.cleanupPeer();
    this.remoteDescSet = false;
    this.pendingCandidates = [];

    this.peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => this.peerConnection!.addTrack(t, this.localStream!));
    }

    // Remote stream
    this.peerConnection.ontrack = e => {
      this.zone.run(() => {
        if (this.remoteVideo?.nativeElement) {
          this.remoteVideo.nativeElement.srcObject = e.streams[0];
        }
        this.cd.detectChanges();
      });
    };

    // ICE candidates
    this.peerConnection.onicecandidate = e => {
      if (e.candidate) this.socket.emit('vc-ice', e.candidate);
    };

    if (isInitiator) {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      this.socket.emit('vc-offer', offer);
    }
  }

  private async flushCandidates() {
    for (const c of this.pendingCandidates) {
      try { await this.peerConnection!.addIceCandidate(c); } catch { }
    }
    this.pendingCandidates = [];
  }

  private cleanupPeer() {
    if (this.peerConnection) { this.peerConnection.close(); this.peerConnection = null; }
    if (this.remoteVideo?.nativeElement) this.remoteVideo.nativeElement.srcObject = null;
  }

  // ─── Media Controls ───────────────────────────────────────────────────────
  toggleMic() {
    if (!this.localStream) return;
    this.isMicMuted = !this.isMicMuted;
    this.localStream.getAudioTracks().forEach(t => (t.enabled = !this.isMicMuted));
  }

  toggleCam() {
    if (!this.localStream) return;
    this.isCamOff = !this.isCamOff;
    this.localStream.getVideoTracks().forEach(t => (t.enabled = !this.isCamOff));
  }

  // ─── Chat ─────────────────────────────────────────────────────────────────
  sendMessage() {
    if (!this.connected) {
      Swal.fire({
        icon: 'info',
        title: this.translate.instant('CHAT.PARTNER'),
        text: this.translate.instant('CHAT.message_NO_PARTNER'),
        confirmButtonText: this.translate.instant('HOME.ERROR_OK')
      });
      return;
    }
    const text = this.message.trim();
    if (!text) {
      Swal.fire({
        icon: 'info',
        title: this.translate.instant('CHAT.Empty_text'),
        text: this.translate.instant('CHAT.empty_message'),
        confirmButtonText: this.translate.instant('HOME.ERROR_OK')
      });
      return;
    }
    const msg: ChatMsg = {
      id: this.genId(), sender: 'user',
      senderName: this.myName, text,
      time: this.formatTime(new Date().toISOString())
    };
    this.messages.push(msg);
    this.socket.emit('sendMessage', { id: msg.id, text });
    this.message = '';
    this.sendSound.currentTime = 0;
    this.sendSound.play().catch(() => { });
    this.scrollToBottom();
  }

  onTyping() { if (this.connected) this.socket.emit('typing'); }

  getDisplayName(n: string | undefined) { return n ? n.split('-')[0] : ''; }

  // ─── Navigation ───────────────────────────────────────────────────────────
  exitCall() {
    this.socket?.emit('leave');
    this.socket?.disconnect();
    this.localStream?.getTracks().forEach(t => t.stop());
    this.cleanupPeer();
    this.router.navigate(['/']);
  }

  nextCall() {
    this.socket?.emit('leave');
    this.socket?.disconnect();
    this.messages = [];
    this.connected = false;
    this.waiting = true;
    this.waitingMessageShown = false;
    this.partnerDisconnected = false;
    this.cleanupPeer();
    this.cd.detectChanges();

    fetch(`${environment.SayHello_Server}/start-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: this.myName })
    })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => setTimeout(() => this.initSocket(d.token), 500))
      .catch(() => this.router.navigate(['/']));
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  private addSysMsg(key: string) {
    this.messages.push({ id: this.genId(), sender: 'system', key });
    this.scrollToBottom();
    this.cd.detectChanges();
  }

  private scrollToBottom() {
    setTimeout(() => {
      if (this.chatBox) this.chatBox.nativeElement.scrollTop = this.chatBox.nativeElement.scrollHeight;
    }, 50);
  }

  private formatTime(iso: string): string {
    const d = new Date(iso);
    let h = d.getHours(); const m = d.getMinutes();
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m < 10 ? '0' + m : m} ${ap}`;
  }

  private genId() { return 'vc-' + Math.random().toString(36).substr(2, 9); }

  get isDarkMode() { return document.body.classList.contains('dark-mode'); }
  get isRtl() { return this.translate.currentLang === 'ar'; }

  ngOnDestroy() {
    this.socket?.disconnect();
    clearTimeout(this.typingTimeout);
    this.localStream?.getTracks().forEach(t => t.stop());
    this.cleanupPeer();
  }
}

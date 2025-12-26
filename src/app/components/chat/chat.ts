import { Component, NgZone, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef, CUSTOM_ELEMENTS_SCHEMA, ViewChildren, QueryList } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { io, Socket } from 'socket.io-client';
import Swal from 'sweetalert2';
import { ChatService } from '../../service/chat-service';
import { environment } from '../../environments/environment.development';
import { ChatMessage } from '../../models/chat-message';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './chat.html',
  styleUrls: ['./chat.css']
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
  connectedUsers: number = 0;
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
  showWelcome = true;

  constructor(private route: ActivatedRoute, private zone: NgZone, private translate: TranslateService, private cd: ChangeDetectorRef, private router: Router, private chatService: ChatService) { }
  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.myName = params['name'] || '';
      if (!this.myName) {
        this.router.navigate(['/']);
        return;
      }
    });
  }

  startChat() {
    this.showWelcome = false;
    this.connectToServer();
  }

  connectToServer() {
    fetch(`${environment.SayHello_Server}/start-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: this.myName })
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to start chat');
        return res.json();
      })
      .then(data => {
        const token = data.token;
        this.initSocket(token); // توصيل مع السيرفر
      })
      .catch(err => {
        console.error(err);
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

    this.socket.on('connected', () => this.zone.run(() => {
      this.connected = true;
      this.waiting = false;
      this.addSystemMessage('CHAT.CONNECTED');
    }));

    this.socket.on('user_count', (count: number) => this.zone.run(() => {
      this.connectedUsers = count;
      this.chatService.connectedUsers$.next(this.connectedUsers);
      this.cd.detectChanges();
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
      this.addSystemMessage('CHAT.PARTNER_LEFT');
      this.cd.detectChanges();
    }));

    this.socket.on('newMessage', msg => this.zone.run(() => {
      this.messages.push({
        sender: 'user',
        senderName: msg.sender,
        text: msg.text,
        time: this.formatTime(msg.time)
      });
      this.scrollToBottom();
      this.cd.detectChanges();
    }));

    this.socket.on('typing', (senderName: string) => this.zone.run(() => {
      if (senderName !== this.myName) {
        this.isTyping = true;
        this.cd.detectChanges();
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
          this.isTyping = false;
          this.cd.detectChanges();
        }, 1000); // يختفي بعد 1.2 ثانية
      }
    }));

    this.socket.on('newVoice', msg => {
      this.zone.run(() => {
        const chatMsg: ChatMessage = {
          sender: 'user',
          senderName: msg.sender,
          audioUrl: msg.url,
          time: this.formatTime(msg.time),
          currentTime: '0:00',
          isPlaying: false
        };

        this.messages.push(chatMsg);

        setTimeout(() => {
          const lastAudio = this.audioEls.toArray().pop();
          if (lastAudio) {
            chatMsg.audioRef = lastAudio.nativeElement;

            chatMsg.isPlaying = false;
            chatMsg.currentTime = '0:00';

            chatMsg.audioRef.onended = () => {
              this.zone.run(() => {
                chatMsg.isPlaying = false;
                chatMsg.currentTime = '0:00';
                this.cd.detectChanges();
              });
            };

            chatMsg.audioRef.ontimeupdate = () => {
              const minutes = Math.floor(chatMsg.audioRef!.currentTime / 60);
              const seconds = Math.floor(chatMsg.audioRef!.currentTime % 60).toString().padStart(2, '0');
              this.zone.run(() => {
                chatMsg.currentTime = `${minutes}:${seconds}`;
                this.cd.detectChanges(); // إعادة الرسم في كل تحديث
              });
            };
          }
        }, 50);

        this.scrollToBottom();
        this.cd.detectChanges();
      });
    });
  }

  async startRecording() {
    if (!this.connected) return;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioChunks = [];
    this.isCanceled = false; // كل مرة تسجيل جديد
    this.mediaRecorder = new MediaRecorder(stream);

    this.mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) this.audioChunks.push(e.data);
    };

    this.mediaRecorder.onstop = () => {
      stream.getTracks().forEach(track => track.stop());

      if (!this.isCanceled && this.audioChunks.length > 0) {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.uploadVoice(audioBlob);
      }
      this.audioChunks = [];
    };

    this.isRecording = true;
    this.cd.detectChanges();

    this.zone.run(() => {
      this.startRecordTimer();
    });

    this.mediaRecorder.start();
  }

  cancelRecording() {
    this.stopRecordTimer();
    if (this.isRecording) {
      this.isCanceled = true;
      this.mediaRecorder?.stop();
      this.isRecording = false;
      this.cd.detectChanges();
    }
  }

  stopRecording() {
    if (!this.mediaRecorder || !this.isRecording) return;

    this.mediaRecorder.stop();
    this.isRecording = false;
  }

  async togglePlay(msg: ChatMessage) {
    const audioEl = msg.audioRef;
    if (!audioEl) return;

    // إيقاف أي صوت آخر
    this.messages.forEach(m => {
      if (m !== msg && m.isPlaying && m.audioRef) {
        m.audioRef.pause();
        this.zone.run(() => {
          m.isPlaying = false;
          m.currentTime = '0:00';
          this.cd.detectChanges();
        });
      }
    });

    if (!audioEl.paused) {
      audioEl.pause();
      this.zone.run(() => {
        msg.isPlaying = false;
        msg.currentTime = '0:00';
        this.cd.detectChanges();
      });
      return;
    }

    if (audioEl.readyState < 4) {
      await new Promise<void>(resolve => audioEl.oncanplaythrough = () => resolve());
    }

    try {
      await audioEl.play();
      this.zone.run(() => {
        msg.isPlaying = true;
        this.cd.detectChanges();
      });
    } catch (err) {
      console.error(err);
      this.zone.run(() => {
        msg.isPlaying = false;
        this.cd.detectChanges();
      });
    }
  }

  uploadVoice(blob: Blob) {
    const formData = new FormData();
    formData.append('voice', blob, 'voice.webm');

    fetch(`${environment.SayHello_Server}/upload-voice`, {
      method: 'POST',
      body: formData
    })
      .then(res => res.json())
      .then(data => {
        this.socket.emit('sendVoice', { url: data.url });
        // تشغيل صوت الإرسال
        this.sendSound.currentTime = 0;
        this.sendSound.play().catch(err => console.warn(err));
      });
  }

  onStartVoiceClick() {
    if (!this.connected) {
      Swal.fire({
        icon: 'info',
        title: this.translate.currentLang === 'ar' ? 'لا يوجد شريك' : 'No partner',
        text: this.translate.currentLang === 'ar' ? 'لا يمكنك تسجيل رسالة صوتية قبل الاتصال بشريك' : 'You cannot record a voice message without a partner'
      });
      return;
    }

    this.startRecording();
    this.startRecordTimer(); // تشغيل العداد مباشرة
  }

  onOpentoggleEmoji() {
    if (!this.connected) {
      Swal.fire({
        icon: 'info',
        title: this.translate.currentLang === 'ar' ? 'لا يوجد شريك' : 'No partner',
        text: this.translate.currentLang === 'ar' ? 'لا يمكنك تسجيل رسالة صوتية قبل الاتصال بشريك' : 'You cannot record a voice message without a partner'
      });
      return;
    }

    this.toggleEmoji()
  }

  startRecordTimer() {
    let seconds = 0;
    this.recordTime = '0:00';
    clearInterval(this.recordInterval);

    this.recordInterval = setInterval(() => {
      seconds++;
      const mins = Math.floor(seconds / 60);
      const secs = (seconds % 60).toString().padStart(2, '0');

      this.zone.run(() => {
        this.recordTime = `${mins}:${secs}`;
        this.cd.detectChanges();
      });
    }, 1000);
  }

  stopRecordTimer() {
    clearInterval(this.recordInterval);
  }

  get confirmText(): string {
    // لو اللغة الحالية عربي
    if (this.translate.currentLang === 'ar') {
      return 'هل أنت متأكد؟';
    }
    // غير كده (افتراضي إنجليزية)
    return 'Are you sure?';
  }

  sendMessage() {
    if (!this.connected || !this.message.trim()) return;
    this.socket.emit('sendMessage', this.message.trim());
    // تشغيل صوت الإرسال
    this.sendSound.currentTime = 0; // إعادة الصوت من البداية
    this.sendSound.play().catch(err => console.warn(err));

    this.message = '';
  }

  onTyping() {
    if (this.connected) {
      this.socket.emit('typing', this.myName);
    }
  }

  toggleEmoji() {
    this.showEmoji = !this.showEmoji;
  }

  onEmojiSelect(event: any) {
    this.message += event.detail.unicode;
    this.showEmoji = false;
  }

  onNextClick() {
    if (!this.confirmNext) {
      this.confirmNext = true;

      clearTimeout(this.confirmTimeout);
      this.confirmTimeout = setTimeout(() => {
        this.confirmNext = false;
        this.cd.detectChanges();
      }, 2000); // يرجع طبيعي بعد ثانيتين

      return;
    }

    this.confirmNext = false;
    clearTimeout(this.confirmTimeout);
    this.nextChat();
  }

  onExitClick() {
    if (!this.exitConfirm) {
      this.exitConfirm = true;

      clearTimeout(this.exitTimeout);
      this.exitTimeout = setTimeout(() => {
        this.exitConfirm = false;
        this.cd.detectChanges();
      }, 2000); // يرجع طبيعي بعد ثانيتين

      return;
    }

    this.exitConfirm = false;
    clearTimeout(this.exitTimeout);
    this.exitChat();
  }

  nextChat() {
    if (!this.socket) return;
    this.socket.emit('leave');
    this.socket.disconnect();
    this.messages = [];
    this.connected = false;
    this.waiting = true;
    this.waitingMessageShown = false;
    this.cd.detectChanges();

    fetch(`${environment.SayHello_Server}/start-chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: this.myName }) })
      .then(res => { if (!res.ok) throw new Error('Failed to get new token'); return res.json(); })
      .then(data => { this.token = data.token; setTimeout(() => this.initSocket(this.token), 500); })
      .catch(err => { console.error(err); Swal.fire({ icon: 'error', title: this.translate.instant('HOME.ERROR_TITLE'), text: this.translate.instant('HOME.ERROR_SERVER') }); this.router.navigate(['/']); });
  }

  exitChat() { this.socket?.disconnect(); this.router.navigate(['/']); }

  private addSystemMessage(key: string) {
    this.messages.push({ sender: 'system', key });
    this.scrollToBottom();
    this.cd.detectChanges();
  }

  private scrollToBottom() {
    setTimeout(() => { if (this.chatBox) this.chatBox.nativeElement.scrollTop = this.chatBox.nativeElement.scrollHeight; }, 50);
  }

  private formatTime(isoTime: string): string {
    const date = new Date(isoTime);
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const mins = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${mins} ${ampm}`;
  }

  get isDarkMode(): boolean { return document.body.classList.contains('dark-mode'); }

  ngOnDestroy() {
    this.socket?.disconnect();
    clearTimeout(this.typingTimeout);
    clearTimeout(this.confirmTimeout);
    clearTimeout(this.exitTimeout);
  }

  get isRtl(): boolean {
    return this.translate.currentLang === 'ar';
  }

  // private addChatMessage(sender: string, text: string, isoTime: string) {
  //   this.messages.push({ sender: 'user', text: `${sender}: ${text}`, time: this.formatTime(isoTime) });
  //   this.scrollToBottom();
  //   this.cd.detectChanges();
  // }
}

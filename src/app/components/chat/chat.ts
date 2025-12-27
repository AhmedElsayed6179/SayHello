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
  deleteSound = new Audio('deleteSound.wav');
  showWelcome = true;
  partnerRecording = false;
  private recordingTimeout: any;
  private recordingPing: any;
  private lastClickTime: number = 0;
  private doubleClickThreshold = 300;
  isRecordingPaused = false;
  recordedSeconds = 0;


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
      const exists = this.messages.find(m => m.id === msg.id);
      if (!exists) {
        this.messages.push({
          id: msg.id,
          sender: 'user',
          senderName: msg.sender,
          text: msg.text,
          time: this.formatTime(msg.time)
        });
      }
      this.scrollToBottom();
      this.cd.detectChanges();
    }));

    this.socket.on('typing', () => this.zone.run(() => {
      this.isTyping = true;
      this.cd.detectChanges();

      clearTimeout(this.typingTimeout);
      this.typingTimeout = setTimeout(() => {
        this.isTyping = false;
        this.cd.detectChanges();
      }, 1000);
    }));

    this.socket.on('newVoice', msg => {
      this.zone.run(() => {

        const chatMsg: ChatMessage = {
          id: msg.id,
          sender: 'user',
          senderName: msg.sender,
          audioUrl: msg.url,
          duration: msg.duration,
          remainingTime: this.formatSeconds(msg.duration),
          isPlaying: false,
          time: this.formatTime(msg.time) // لو عندك الوقت
        };

        // 🔴 هنا ضيف push + detectChanges + scroll
        this.messages.push(chatMsg);
        this.cd.detectChanges();
        this.scrollToBottom();

        setTimeout(() => {
          const audioList = this.audioEls.toArray();
          if (!audioList.length) return;

          const lastAudio = audioList[audioList.length - 1];
          chatMsg.audioRef = lastAudio.nativeElement;

          chatMsg.audioRef.onended = () => {
            this.zone.run(() => {
              chatMsg.isPlaying = false;
              chatMsg.remainingTime = this.formatSeconds(chatMsg.duration!);
              chatMsg.audioRef!.currentTime = 0;
              this.cd.detectChanges();
            });
          };

          chatMsg.audioRef.ontimeupdate = () => {
            const remaining =
              Math.max(
                chatMsg.duration! - Math.floor(chatMsg.audioRef!.currentTime),
                0
              );

            this.zone.run(() => {
              chatMsg.remainingTime = this.formatSeconds(remaining);
              this.cd.detectChanges();
            });
          };

        }, 50);

        this.scrollToBottom();
        this.cd.detectChanges();
      });
    });

    this.socket.on('partnerRecording', (isRecording: boolean) => {
      this.zone.run(() => {

        if (isRecording) {
          this.partnerRecording = true;

          // 🔴 مهم: timeout أطول من ping
          clearTimeout(this.recordingTimeout);
          this.recordingTimeout = setTimeout(() => {
            this.partnerRecording = false;
            this.cd.detectChanges();
          }, 1500);
        } else {
          this.partnerRecording = false;
          clearTimeout(this.recordingTimeout);
        }

        this.cd.detectChanges();
      });
    });

    this.socket.on('newReaction', data => {
      if (!data.messageId) return;          // ← تأكد من وجود الـ messageId
      const msg = this.messages.find(m => m.id === data.messageId);
      if (msg) {
        msg.reaction = data.reaction;       // ← تعديل الرسالة مباشرة
        this.cd.detectChanges();            // ← لتحديث العرض
      }
    });
  }

  async startRecording() {
    if (!this.connected) return;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(stream);

    this.audioChunks = [];
    this.isCanceled = false;
    this.isRecordingPaused = false;

    this.mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) this.audioChunks.push(e.data);
    };

    this.mediaRecorder.onstop = () => {
      stream.getTracks().forEach(track => track.stop());
      this.stopRecordingPing();
      this.socket.emit('stopRecording');

      if (!this.isCanceled && this.audioChunks.length > 0) {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.uploadVoice(audioBlob, this.recordedSeconds);
      }

      this.audioChunks = [];
      this.recordedSeconds = 0;
    };

    this.mediaRecorder.start();
    this.isRecording = true;

    this.startRecordTimer();
    this.startRecordingPing(); // ⬅️ هنا بس
  }

  startRecordingPing() {
    this.stopRecordingPing();
    this.recordingPing = setInterval(() => {
      if (!this.isRecordingPaused) {
        this.socket.emit('startRecording');
      }
    }, 800);
  }

  stopRecordingPing() {
    if (this.recordingPing) {
      clearInterval(this.recordingPing);
      this.recordingPing = null;
    }
  }

  cancelRecording() {
    this.stopRecordTimer();
    if (this.isRecording) {
      this.isCanceled = true;
      clearInterval(this.recordingPing);
      this.socket.emit('stopRecording');
      this.mediaRecorder?.stop();
      this.isRecording = false;
      this.cd.detectChanges();

      this.deleteSound.currentTime = 0;
      this.deleteSound.play().catch(err => console.warn(err));
    }
  }

  stopRecording() {
    if (!this.mediaRecorder || !this.isRecording) return;

    clearInterval(this.recordingPing);
    this.socket.emit('stopRecording');

    this.mediaRecorder.stop();
    this.isRecording = false;
    this.mediaRecorder.stop();
  }

  togglePlay(msg: ChatMessage) {
    const audio = msg.audioRef!;
    if (!audio) return;

    if (msg.isPlaying) {
      audio.pause();
      msg.isPlaying = false;
      return;
    }

    audio.play();
    msg.isPlaying = true;

    audio.ontimeupdate = () => {
      const remaining = Math.max((msg.duration || 0) - Math.floor(audio.currentTime), 0);
      msg.remainingTime = this.formatSeconds(remaining);
      this.cd.detectChanges();
    };

    audio.onended = () => {
      msg.isPlaying = false;
      msg.remainingTime = this.formatSeconds(msg.duration || 0);
      audio.currentTime = 0;
      this.cd.detectChanges();
    };
  }

  formatSeconds(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  uploadVoice(blob: Blob, duration: number) {
    const formData = new FormData();
    formData.append('voice', blob, 'voice.webm');

    fetch(`${environment.SayHello_Server}/upload-voice`, {
      method: 'POST',
      body: formData
    })
      .then(res => res.json())
      .then(data => {
        const msgId = this.generateUniqueId();
        this.socket.emit('sendVoice', {
          id: msgId,
          url: data.url,
          duration
        });

        this.sendSound.currentTime = 0;
        this.sendSound.play().catch(() => { });
      });
  }

  seekAudio(msg: ChatMessage, event: any) {
    const value = Number(event.target.value);
    if (msg.audioRef) {
      msg.audioRef.currentTime = value;

      // لتحديث العداد مباشرة عند السحب
      msg.remainingTime = this.formatSeconds(Math.max((msg.duration || 0) - value, 0));
      this.cd.detectChanges();
    }
  }

  onStartVoiceClick() {
    if (!this.connected) {
      Swal.fire({
        icon: 'info',
        title: this.translate.currentLang === 'ar' ? 'لا يوجد شريك' : 'No partner',
        text: this.translate.currentLang === 'ar' ? 'لا يمكنك تسجيل رسالة صوتية قبل الاتصال بشريك' : 'You cannot record a voice message without a partner',
        confirmButtonText: this.translate.currentLang === 'ar' ? 'تم' : 'OK'
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
        text: this.translate.currentLang === 'ar' ? 'لا يمكنك استخدام الإيموجي بدون شريك' : 'You cannot use emojis without a partner',
        confirmButtonText: this.translate.currentLang === 'ar' ? 'تم' : 'OK'
      });
      return;
    }

    this.toggleEmoji()
  }

  startRecordTimer() {
    clearInterval(this.recordInterval);
    this.recordInterval = setInterval(() => {
      if (!this.isRecordingPaused) { // عد الثواني فقط لو التسجيل شغال
        this.recordedSeconds++;
        const mins = Math.floor(this.recordedSeconds / 60);
        const secs = (this.recordedSeconds % 60).toString().padStart(2, '0');
        this.recordTime = `${mins}:${secs}`;
        this.cd.detectChanges();
      }
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
    const chatMsg: ChatMessage = {
      id: this.generateUniqueId(),
      sender: 'user',
      senderName: this.myName,
      text: this.message.trim(),
      time: this.formatTime(new Date().toISOString())
    };

    this.messages.push(chatMsg); // ← اختياري إذا عايز يظهر فورًا
    this.socket.emit('sendMessage', {
      id: chatMsg.id,
      text: chatMsg.text
    });
    this.message = '';

    // تشغيل صوت الإرسال
    this.sendSound.currentTime = 0; // إعادة الصوت من البداية
    this.sendSound.play().catch(err => console.warn(err));

    this.message = '';
  }

  generateUniqueId(): string {
    return 'msg-' + Math.random().toString(36).substr(2, 9);
  }

  togglePauseResume() {
    if (!this.mediaRecorder) return;

    if (this.isRecordingPaused) {
      // ▶️ Resume
      this.mediaRecorder.resume();
      this.isRecordingPaused = false;

      this.startRecordTimer();
      this.startRecordingPing();
      this.socket.emit('resumeRecording');

    } else {
      // ⏸️ Pause
      this.mediaRecorder.pause();
      this.isRecordingPaused = true;

      this.stopRecordTimer();
      this.stopRecordingPing();
      this.socket.emit('pauseRecording');
    }
  }

  reactToMessage(msg: ChatMessage, reaction: string) {
    const now = Date.now();

    if (now - this.lastClickTime < this.doubleClickThreshold) {
      // ضغطتين متتاليتين → toggle الريأكشن
      msg.reaction = msg.reaction === reaction ? undefined : reaction;

      // أرسل للسيرفر
      this.socket.emit('react', {
        messageId: msg.id,
        reaction: msg.reaction
      });

      this.cd.detectChanges();
      this.lastClickTime = 0; // reset
    } else {
      // أول click → سجل الوقت
      this.lastClickTime = now;
    }
  }

  toggleReaction(msg: ChatMessage, reaction: string) {
    if (!msg.id) return;
    this.socket.emit('react', { messageId: msg.id, reaction });
    msg.reaction = reaction;
    this.cd.detectChanges();
  }

  onTyping() {
    if (this.connected) {
      this.socket.emit('typing');
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
      .catch(err => { console.error(err); Swal.fire({ icon: 'error', title: this.translate.instant('HOME.ERROR_TITLE'), text: this.translate.instant('HOME.ERROR_SERVER'), confirmButtonText: this.translate.currentLang === 'ar' ? 'تم' : 'OK' }); this.router.navigate(['/']); });
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
    clearTimeout(this.recordingTimeout);
    clearInterval(this.recordInterval);
    clearInterval(this.recordingPing);
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

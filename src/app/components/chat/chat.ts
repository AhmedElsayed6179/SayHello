import { Component, NgZone, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef, CUSTOM_ELEMENTS_SCHEMA, ViewChildren, QueryList } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { io, Socket } from 'socket.io-client';
import Swal from 'sweetalert2';
import { ChatService } from '../../service/chat-service';
import { environment } from '../../environments/environment.development';

// تعريف الواجهة هنا أو استيرادها
export interface ChatMessage {
  id?: string;
  sender: 'user' | 'partner' | 'system'; // 'user' = أنا, 'partner' = الشريك
  senderId?: string; // الـ ID الفريد
  senderName?: string;
  text?: string;
  key?: string; // لرسائل النظام
  audioUrl?: string;
  duration?: number;
  remainingTime?: string;
  isPlaying?: boolean;
  audioRef?: HTMLAudioElement;
  time?: string;
  reactions?: { [reaction: string]: string[] }; // تخزين الأسماء داخل الرياكشن
}

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
  public mySocketId = ''; // لتخزين معرفي الخاص
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
  isRecordingPaused = false;
  recordedSeconds = 0;

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
      this.myName = params['name'] || '';
      if (!this.myName) {
        this.router.navigate(['/']);
        return;
      }
      if (params['token']) {
        this.token = params['token'];
      }
    });
  }

  get isRtl(): boolean {
    return this.translate.currentLang === 'ar';
  }

  startChat() {
    this.showWelcome = false;
    if (this.token) {
      this.initSocket(this.token);
    } else {
      this.connectToServer();
    }
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
        this.token = data.token;
        this.initSocket(this.token);
      })
      .catch(err => {
        console.error(err);
        Swal.fire(
          this.isRtl ? 'خطأ' : 'Error',
          this.isRtl ? 'فشل الاتصال بالسيرفر' : 'Failed to connect to server',
          'error'
        );
        this.router.navigate(['/']);
      });
  }

  initSocket(token: string) {
    if (this.socket) {
      this.socket.emit('leave');
      this.socket.disconnect();
    }

    this.socket = io(`${environment.SayHello_Server}`, { transports: ['websocket'] });

    // عند الاتصال نحفظ الـ ID الخاص بنا
    this.socket.on('connect', () => {
      this.mySocketId = this.socket.id || '';
    });

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

    // استقبال الرسائل النصية
    this.socket.on('newMessage', (msg: any) => this.zone.run(() => {
      const exists = this.messages.find(m => m.id === msg.id);

      // هنا المنطق الجديد: نحدد هوية المرسل بناءً على الـ ID
      const isMe = msg.senderId === this.socket.id;

      if (!exists) {
        this.messages.push({
          id: msg.id,
          sender: isMe ? 'user' : 'partner', // 'user' = أنا, 'partner' = هو
          senderId: msg.senderId,
          senderName: msg.senderName,
          text: msg.text,
          time: this.formatTime(msg.time),
          reactions: msg.reactions || {}
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
      }, 1000);
    }));

    // استقبال الصوت
    this.socket.on('newVoice', (msg: any) => {
      this.zone.run(() => {
        const exists = this.messages.find(m => m.id === msg.id);
        if (exists) return;

        const isMe = msg.senderId === this.socket.id;

        const chatMsg: ChatMessage = {
          id: msg.id,
          sender: isMe ? 'user' : 'partner',
          senderId: msg.senderId,
          senderName: msg.senderName,
          audioUrl: msg.url,
          duration: msg.duration,
          remainingTime: this.formatSeconds(msg.duration),
          isPlaying: false,
          time: this.formatTime(msg.time),
          reactions: msg.reactions || {}
        };

        this.messages.push(chatMsg);
        this.cd.detectChanges();
        this.scrollToBottom();

        setTimeout(() => {
          const audioList = this.audioEls.toArray();
          if (!audioList.length) return;

          // ربط الصوت بالعنصر الأخير
          const lastAudio = audioList.find((el, index) => index === audioList.length - 1);
          if (lastAudio) {
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
              const remaining = Math.max(
                chatMsg.duration! - Math.floor(chatMsg.audioRef!.currentTime),
                0
              );
              this.zone.run(() => {
                chatMsg.remainingTime = this.formatSeconds(remaining);
                this.cd.detectChanges();
              });
            };
          }
        }, 100);
      });
    });

    this.socket.on('partnerRecording', (isRecording: boolean) => {
      this.zone.run(() => {
        if (isRecording) {
          this.partnerRecording = true;
          clearTimeout(this.recordingTimeout);
          this.recordingTimeout = setTimeout(() => {
            this.partnerRecording = false;
            this.cd.detectChanges();
          }, 2000);
        } else {
          this.partnerRecording = false;
          clearTimeout(this.recordingTimeout);
        }
        this.cd.detectChanges();
      });
    });

    this.socket.on('newReaction', (data: any) => {
      this.zone.run(() => {
        const msg = this.messages.find(m => m.id === data.messageId);
        if (msg) {
          msg.reactions = data.reactions;
          this.cd.detectChanges();
        }
      });
    });
  }

  // --- دوال التسجيل والصوت (نفس المنطق السابق) ---

  async startRecording() {
    if (!this.connected) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);

      this.recordedSeconds = 0;
      this.recordTime = '0:00';
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
        this.recordTime = '0:00';
        this.cd.detectChanges();
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      this.startRecordTimer();
      this.startRecordingPing();
      this.cd.detectChanges();

    } catch (err) {
      console.error('Error accessing microphone:', err);
      Swal.fire({
        icon: 'error',
        title: this.isRtl ? 'خطأ' : 'Error',
        text: this.isRtl ? 'لا يمكن الوصول للميكروفون' : 'Cannot access microphone',
        confirmButtonText: this.isRtl ? 'حسناً' : 'OK'
      });
    }
  }

  startRecordingPing() {
    this.stopRecordingPing();
    this.socket.emit('startRecording');
    this.recordingPing = setInterval(() => {
      if (!this.isRecordingPaused && this.isRecording) {
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
      this.stopRecordingPing();
      this.socket.emit('stopRecording');

      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }

      this.isRecording = false;
      this.cd.detectChanges();

      this.deleteSound.currentTime = 0;
      this.deleteSound.play().catch(() => { });
    }
  }

  stopRecording() {
    if (!this.mediaRecorder || !this.isRecording) return;
    this.stopRecordTimer();
    this.mediaRecorder.stop();
    this.isRecording = false;
  }

  togglePauseResume() {
    if (!this.mediaRecorder) return;

    if (this.isRecordingPaused) {
      this.mediaRecorder.resume();
      this.isRecordingPaused = false;
      this.startRecordTimer();
      this.startRecordingPing();
      this.socket.emit('resumeRecording');
    } else {
      this.mediaRecorder.pause();
      this.isRecordingPaused = true;
      this.stopRecordTimer();
      this.stopRecordingPing();
      this.socket.emit('pauseRecording');
    }
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
        // إرسال للسيرفر
        this.socket.emit('sendVoice', {
          id: msgId,
          url: data.url,
          duration
        });

        // إظهار الرسالة محلياً فوراً
        this.messages.push({
          id: msgId,
          sender: 'user', // أنا
          senderId: this.socket.id,
          senderName: this.myName,
          audioUrl: data.url,
          duration: duration,
          remainingTime: this.formatSeconds(duration),
          isPlaying: false,
          time: this.formatTime(new Date().toISOString()),
          reactions: {}
        });
        this.scrollToBottom();

        this.sendSound.currentTime = 0;
        this.sendSound.play().catch(() => { });
      })
      .catch(err => console.error('Upload failed', err));
  }

  togglePlay(msg: ChatMessage) {
    const audio = msg.audioRef;
    if (!audio) return;

    if (msg.isPlaying) {
      audio.pause();
      msg.isPlaying = false;
    } else {
      this.messages.forEach(m => {
        if (m !== msg && m.isPlaying && m.audioRef) {
          m.audioRef.pause();
          m.isPlaying = false;
        }
      });

      audio.play();
      msg.isPlaying = true;
    }
  }

  seekAudio(msg: ChatMessage, event: any) {
    const value = Number(event.target.value);
    if (msg.audioRef) {
      msg.audioRef.currentTime = value;
      msg.remainingTime = this.formatSeconds(Math.max((msg.duration || 0) - value, 0));
      this.cd.detectChanges();
    }
  }

  // --- واجهة المستخدم والإرسال ---

  onStartVoiceClick() {
    if (!this.connected) {
      Swal.fire({
        icon: 'info',
        title: this.isRtl ? 'لا يوجد شريك' : 'No partner',
        text: this.isRtl ? 'لا يمكنك تسجيل رسالة صوتية قبل الاتصال بشريك' : 'You cannot record a voice message without a partner',
        confirmButtonText: this.isRtl ? 'حسناً' : 'OK'
      });
      return;
    }
    this.startRecording();
  }

  onOpentoggleEmoji() {
    if (!this.connected) {
      Swal.fire({
        icon: 'info',
        title: this.isRtl ? 'لا يوجد شريك' : 'No partner',
        text: this.isRtl ? 'لا يمكنك استخدام الإيموجي بدون شريك' : 'You cannot use emojis without a partner',
        confirmButtonText: this.isRtl ? 'حسناً' : 'OK'
      });
      return;
    }
    this.toggleEmoji();
  }

  toggleEmoji() {
    this.showEmoji = !this.showEmoji;
  }

  onEmojiSelect(event: any) {
    this.message += event.detail.unicode;
  }

  onTyping() {
    if (this.connected) {
      this.socket.emit('typing');
    }
  }

  startRecordTimer() {
    clearInterval(this.recordInterval);
    this.recordInterval = setInterval(() => {
      this.recordedSeconds++;
      const mins = Math.floor(this.recordedSeconds / 60);
      const secs = (this.recordedSeconds % 60).toString().padStart(2, '0');
      this.recordTime = `${mins}:${secs}`;
      this.cd.detectChanges();
    }, 1000);
  }

  stopRecordTimer() {
    clearInterval(this.recordInterval);
  }

  sendMessage() {
    if (!this.connected) {
      Swal.fire({
        icon: 'info',
        title: this.isRtl ? 'لا يوجد شريك' : 'No partner',
        text: this.isRtl ? 'لا يمكنك إرسال رسالة بدون شريك' : 'You cannot send a message without a partner',
        confirmButtonText: this.isRtl ? 'حسناً' : 'OK'
      });
      return;
    }

    const text = this.message.trim();
    if (!text) {
      Swal.fire({
        icon: 'info',
        title: this.isRtl ? 'نص فارغ' : 'Empty text',
        text: this.isRtl ? 'لا يمكنك إرسال رسالة فارغة' : 'You cannot send an empty message',
        confirmButtonText: this.isRtl ? 'حسناً' : 'OK'
      });
      return;
    }

    const msgId = this.generateUniqueId();

    // إضافة الرسالة محلياً فوراً
    const chatMsg: ChatMessage = {
      id: msgId,
      sender: 'user', // أنا
      senderId: this.socket.id, // هويتي
      senderName: this.myName,
      text,
      time: this.formatTime(new Date().toISOString()),
      reactions: {}
    };

    this.messages.push(chatMsg);
    this.socket.emit('sendMessage', { id: msgId, text });

    this.message = '';
    this.showEmoji = false;
    this.sendSound.currentTime = 0;
    this.sendSound.play().catch(() => { });
    this.scrollToBottom();
  }

  toggleReaction(msg: ChatMessage, reaction: string) {
    if (!msg.id) return;

    if (!msg.reactions) msg.reactions = {};
    if (!msg.reactions[reaction]) msg.reactions[reaction] = [];

    // نستخدم الاسم للعرض في الرياكشن (يمكن تغييره لـ ID لو أردت دقة أكبر)
    const idx = msg.reactions[reaction].indexOf(this.myName);

    if (idx === -1) {
      msg.reactions[reaction].push(this.myName);
    } else {
      msg.reactions[reaction].splice(idx, 1);
    }

    if (msg.reactions[reaction].length === 0) {
      delete msg.reactions[reaction];
    }

    this.socket.emit('react', {
      messageId: msg.id,
      reaction,
      sender: this.myName // الاسم يكفي هنا للعرض
    });

    this.cd.detectChanges();
  }

  reactToMessage(msg: ChatMessage, reaction: string) {
    this.toggleReaction(msg, reaction);
  }

  get confirmText(): string {
    return this.isRtl ? 'هل أنت متأكد؟' : 'Are you sure?';
  }

  onNextClick() {
    if (!this.confirmNext) {
      this.confirmNext = true;
      clearTimeout(this.confirmTimeout);
      this.confirmTimeout = setTimeout(() => {
        this.confirmNext = false;
        this.cd.detectChanges();
      }, 2000);
      return;
    }
    this.confirmNext = false;
    this.nextChat();
  }

  onExitClick() {
    if (!this.exitConfirm) {
      this.exitConfirm = true;
      clearTimeout(this.exitTimeout);
      this.exitTimeout = setTimeout(() => {
        this.exitConfirm = false;
        this.cd.detectChanges();
      }, 2000);
      return;
    }
    this.exitConfirm = false;
    this.exitChat();
  }

  nextChat() {
    if (this.socket) {
      this.socket.emit('leave');
      this.socket.disconnect();
    }
    this.messages = [];
    this.connected = false;
    this.waiting = true;
    this.waitingMessageShown = false;
    this.cd.detectChanges();

    fetch(`${environment.SayHello_Server}/start-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: this.myName })
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to get new token');
        return res.json();
      })
      .then(data => {
        this.token = data.token;
        setTimeout(() => this.initSocket(this.token), 500);
      })
      .catch(err => {
        console.error(err);
        Swal.fire({
          icon: 'error',
          title: this.isRtl ? 'خطأ' : 'Error',
          text: this.isRtl ? 'حدث خطأ في السيرفر' : 'Server error occurred',
          confirmButtonText: this.isRtl ? 'حسناً' : 'OK'
        });
        this.router.navigate(['/']);
      });
  }

  exitChat() {
    this.socket?.disconnect();
    this.router.navigate(['/']);
  }

  private addSystemMessage(key: string) {
    this.messages.push({ sender: 'system', key });
    this.scrollToBottom();
    this.cd.detectChanges();
  }

  private scrollToBottom() {
    setTimeout(() => {
      if (this.chatBox) {
        this.chatBox.nativeElement.scrollTop = this.chatBox.nativeElement.scrollHeight;
      }
    }, 50);
  }

  generateUniqueId(): string {
    return 'msg-' + Math.random().toString(36).substr(2, 9);
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

  formatSeconds(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  get isDarkMode(): boolean {
    return document.body.classList.contains('dark-mode');
  }

  ngOnDestroy() {
    this.socket?.disconnect();
    clearTimeout(this.typingTimeout);
    clearTimeout(this.confirmTimeout);
    clearTimeout(this.exitTimeout);
    clearTimeout(this.recordingTimeout);
    clearInterval(this.recordInterval);
    clearInterval(this.recordingPing);
  }
}

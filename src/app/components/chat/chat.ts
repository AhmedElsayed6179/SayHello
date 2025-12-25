import { Component, NgZone, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { io, Socket } from 'socket.io-client';
import Swal from 'sweetalert2';
import { ChatService } from '../../service/chat-service';
import { environment } from '../../environments/environment.development';

type ChatMessage = {
  sender: 'user' | 'system';
  text?: string;
  key?: string;
  time?: string;
  senderName?: string;
};

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

  constructor(private route: ActivatedRoute, private zone: NgZone, private translate: TranslateService, private cd: ChangeDetectorRef, private router: Router, private chatService: ChatService) { }
  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.myName = params['name'] || '';
      if (!this.myName) {
        this.router.navigate(['/']);
        return;
      }

      // طلب سيرفر للحصول على توكن جديد عند كل refresh
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

          // إنشاء الاتصال بعد الحصول على التوكن الجديد
          this.socket = io(`${environment.SayHello_Server}`, { transports: ['websocket'] });

          this.socket.on('user_count', (count: number) => this.zone.run(() => {
            this.connectedUsers = count;
            this.chatService.connectedUsers$.next(this.connectedUsers);
            this.cd.detectChanges();
          }));

          this.initSocket(this.token); // init socket بالتوكن الجديد
        })
        .catch(err => {
          console.error(err);
          Swal.fire('Error', 'Failed to reconnect', 'error');
          this.router.navigate(['/']);
        });
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
  }

  sendMessage() {
    if (!this.connected || !this.message.trim()) return;
    this.socket.emit('sendMessage', this.message.trim());
    this.message = '';
  }

  onTyping() {
    if (this.connected) {
      this.socket.emit('typing', this.myName);
    }
  }

  showEmojiPicker() {
    this.showEmoji = !this.showEmoji;

    if (this.showEmoji) {
      setTimeout(() => {
        const picker: any = document.querySelector('emoji-picker');
        if (!picker) return;

        const shadow = picker.shadowRoot;
        if (!shadow) return;

        // كل التبويبات
        const tabs = shadow.querySelectorAll('.tab');
        tabs.forEach((tab: HTMLElement) => {
          tab.style.paddingBottom = '6px'; // لضبط ارتفاع الخط
          tab.style.position = 'relative';
        });

        // الخط تحت التبويب النشط
        const activeTab = shadow.querySelector('.tab.selected') as HTMLElement;
        if (activeTab) {
          const line = document.createElement('div');
          line.style.position = 'absolute';
          line.style.bottom = '0';
          line.style.left = '50%';
          line.style.transform = 'translateX(-50%)';
          line.style.width = '60%';
          line.style.height = '2px';
          line.style.borderRadius = '2px';
          line.style.backgroundColor = document.body.classList.contains('dark-mode') ? '#fff' : '#0b93f6';
          activeTab.appendChild(line);

          // دائرة حول التبويب النشط
          activeTab.style.border = `2px solid ${document.body.classList.contains('dark-mode') ? '#fff' : '#0b93f6'}`;
          activeTab.style.borderRadius = '50%';
        }
      }, 50);
    }
  }

  onEmojiSelect(event: any) {
    this.message += event.detail.unicode;
    this.showEmoji = false;
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

  private addChatMessage(sender: string, text: string, isoTime: string) {
    this.messages.push({ sender: 'user', text: `${sender}: ${text}`, time: this.formatTime(isoTime) });
    this.scrollToBottom();
    this.cd.detectChanges();
  }

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

  ngOnDestroy() { this.socket?.disconnect(); clearTimeout(this.typingTimeout); }
}

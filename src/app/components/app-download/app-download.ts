import { AsyncPipe, CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { ChatService } from '../../service/chat-service';

@Component({
  selector: 'app-app-download',
  imports: [TranslatePipe, CommonModule, AsyncPipe],
  templateUrl: './app-download.html',
  styleUrl: './app-download.scss',
})
export class AppDownload {
  connectedUsers$: Observable<number>;
  constructor(private chatService: ChatService) {
    this.connectedUsers$ = this.chatService.connectedUsers$;
  }
  get isDarkMode(): boolean {
    return document.body.classList.contains('dark-mode');
  }
}

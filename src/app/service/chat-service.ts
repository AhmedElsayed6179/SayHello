import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../environments/environment.development';

@Injectable({ providedIn: 'root' })
export class ChatService {

  private socket!: Socket;

  connectedUsers$ = new BehaviorSubject<number>(0);

  constructor() {
    this.socket = io(environment.SayHello_Server, {
      transports: ['websocket']
    });

    this.socket.on('user_count', (count: number) => {
      this.connectedUsers$.next(count);
    });
  }
}


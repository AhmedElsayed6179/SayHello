import { Injectable, NgZone } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket!: Socket;
  public usersInRoom$ = new BehaviorSubject<number>(0);

  constructor(private zone: NgZone) { }

  connect(token: string) {
    if (this.socket) this.socket.disconnect();

    this.socket = io('https://sayhelloserver-production.up.railway.app', {
      transports: ['websocket']
    });

    // الانضمام بعد اتصال WebSocket
    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.socket.emit('join', token);
    });

    // استقبال عدد المستخدمين في main-room
    this.socket.on('roomUsersCount', (count: number) => {
      this.zone.run(() => this.usersInRoom$.next(count));
      console.log('Connected to server, count =', count);
    });
  }

  disconnect() {
    this.socket?.disconnect();
  }
}

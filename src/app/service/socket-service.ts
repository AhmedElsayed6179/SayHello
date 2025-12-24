import { Injectable, NgZone } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket!: Socket;
  public usersInRoom$ = new BehaviorSubject<number>(0);

  constructor(private zone: NgZone) { }

  async connect(token: string) {
    if (this.socket) this.socket.disconnect();

    this.socket = io('https://sayhelloserver-production.up.railway.app', {
      transports: ['websocket']
    });

    this.socket.emit('join', token);

    // كل ما يجي العدد من السيرفر يحدث مباشرة الـ BehaviorSubject
    this.socket.on('roomUsersCount', (count: number) => {
      this.zone.run(() => this.usersInRoom$.next(count));
    });
  }

  async disconnect() {
    this.socket?.disconnect();
  }
}

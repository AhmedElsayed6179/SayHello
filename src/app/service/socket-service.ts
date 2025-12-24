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

    this.socket.emit('join', token);

    this.socket.on('roomUsersCount', (count: number) => {
      this.zone.run(() => {
        this.usersInRoom$.next(count);
      });
    });
  }

  disconnect() {
    this.socket?.disconnect();
  }
}

import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ChatService {
  public connectedUsers$ = new BehaviorSubject<number>(0);
}


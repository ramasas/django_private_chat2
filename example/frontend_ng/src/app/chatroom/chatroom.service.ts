import { HttpClient } from '@angular/common/http';
import { Injectable, OnInit } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { BehaviorSubject,catchError, Observable, of } from 'rxjs';
import { MessageEvt, Chatroom, PaginatedResponse } from './chatroom.model';

export class ChatroomState {
  receivedEvtList: MessageEvt[] = [];

  currPageMessage: number = 1;
  currPageDialog: number = 1;

  chatroom?: Chatroom;

  private _self?: { username: string, pk: number };

  constructor() {

  }

  get self_id() {
    return this._self?.pk.toString();
  }

  get self_username() {
    return this._self?.username.toString();
  }

  set self(data: { username: string, pk: number }) {
    this._self = data;
  }
}

@Injectable({
  providedIn: 'root'
})
export class ChatroomService implements OnInit {
  //wsUrl = `ws://${window.location.host}/chat_ws`;
  wsUrl = `ws://localhost:8000/chat_ws`;
  wsOptions = {
    connectionTimeout: 1000,
    maxRetries: 10,
  };
  ws!: ReconnectingWebSocket;

  receivedEvt = new BehaviorSubject<MessageEvt>(null as unknown as MessageEvt);

  state: ChatroomState = new ChatroomState();

  private apiUrl = `http://localhost:8000/`;

  constructor(private http: HttpClient,
    private snackbar: MatSnackBar) {
    
    this.ws = new ReconnectingWebSocket(this.wsUrl, [], this.wsOptions);

    this.ws.onopen = this.onOpen.bind(this);
    this.ws.onmessage = this.onMessage.bind(this);
    this.ws.onclose = this.onClose.bind(this);

    this.reqSelf()
      .pipe(catchError(e => {
        return of(null);
      }))
      .subscribe(res => {
        if (res == null) return;
        this.state.self = res;
      });

  }

  ngOnInit(): void {

  }

  onMessage(evt: MessageEvent) {
    console.log(evt.data);
    // {"msg_type": 3, "random_id": -1549658336, "text": "777", "sender": "1", "sender_username": "admin", "receiver": "1"}
    const data: MessageEvt = JSON.parse(evt.data);
    this.state.receivedEvtList.push(data);
    this.receivedEvt.next(data);
    //if (errMsg) {
    //  this.snackbar.open(errMsg, 'OK', { duration: 3000 });
    //}
  }

  onOpen() {
    this.snackbar.open('Connected', undefined, { duration: 2000 });
  }

  onClose() {
    this.snackbar.open('Disconnected', undefined, { duration: 2000 });
  }

  reqSelf() {
    return this.http.get<{ username: string, pk: number }>(`${this.apiUrl}self/`);
  }

  // Request a list of chatrooms that the user joins
  reqChatrooms(flipPage: number = 0) {
    this.state.currPageDialog += flipPage;
    return this.http.get<PaginatedResponse>(`${this.apiUrl}dialogs/?page=${this.state.currPageDialog}`);
  }

  // Request a list of messages that the user had received
  reqMessages(flipPage: number = 0) {
    this.state.currPageMessage += flipPage;
    return this.http.get<PaginatedResponse>(`${this.apiUrl}messages/?page=${this.state.currPageMessage}`);
  }


  send(data: MessageEvt) {
    this.ws.send(JSON.stringify(data));
  }

  sendMessage(data: { msg_type: number, text: string, dialog_pk: string } ) {
    this.ws.send(JSON.stringify({
      ...data,
      random_id: this.generateRandomId(),
    }));
  }


  get receivedEvt$(): Observable<MessageEvt> {
    return this.receivedEvt.asObservable();
  }

  private generateRandomId() {
    const r = Math.random();
    return -Math.floor(r * Math.pow(2, 31));
  }

}

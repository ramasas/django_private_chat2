import { HttpClient } from '@angular/common/http';
import { Injectable, OnInit } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { BehaviorSubject,  map, Observable, shareReplay, tap } from 'rxjs';

export const MessageTypes = {
  WentOnline: 1,
  WentOffline: 2,
  TextMessage: 3,
  FileMessage: 4,
  IsTyping: 5,
  MessageRead: 6,
  ErrorOccurred: 7,
  MessageIdCreated: 8,
  NewUnreadCount: 9,
  TypingStopped: 10,
}

export interface MessageEvt {
  msg_type: number;
  [key: string]: any;
}

/*
"{\"msg_type\": 3, \"random_id\": -1945908859, \"text\": \"Hey\", \"sender\": \"1\", \"sender_username\": \"admin\", \"receiver\": \"1\"}"
"{\"msg_type\": 8, \"random_id\": -1945908859, \"db_id\": 5}"
"{\"msg_type\": 9, \"sender\": \"1\", \"unread_count\": 0}"
*/
export interface TextMessageEvt extends MessageEvt {
  random_id: number;
  text: string;
  sender: string; // actually int
  sender_username: string;
  receiver: string; // actually int
  //db_id?: number;
  //unread_count?: number;
}

export interface PaginatedResponse {
  page: number;
  pages: number;
  data: any;
}

export interface Chatroom {
  id: number;
  name: string;
  description: string;
  other_users_id: number[];
  username: string[];
  created: Date;
  modified: Date;
  last_message: any;
  unread_count: number;
}

export interface TextMessage {
  id: number;
  text: string;
  sent: Date;
  edited: Date;
  read: boolean;
  file: any;
  sender: string; // actually int
  sender_username: string;
  recipient: string;  // actuall int
  out: boolean;
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

  receivedEvtList: MessageEvt[] = [];
  receivedEvt = new BehaviorSubject<MessageEvt>(null as unknown as MessageEvt);



  private apiUrl = `http://localhost:8000/`;
  private currPageMessage: number = 1;
  private currPageDialog: number = 1;

  constructor(private http: HttpClient,
    private snackbar: MatSnackBar) {
    
    this.ws = new ReconnectingWebSocket(this.wsUrl, [], this.wsOptions);

    this.ws.onopen = this.onOpen.bind(this);
    this.ws.onmessage = this.onMessage.bind(this);
    this.ws.onclose = this.onClose.bind(this);

  }

  ngOnInit(): void {

  }

  onMessage(evt: MessageEvent) {
    console.log(evt.data);
    // {"msg_type": 3, "random_id": -1549658336, "text": "777", "sender": "1", "sender_username": "admin", "receiver": "1"}
    const data: MessageEvt = JSON.parse(evt.data);
    this.receivedEvtList.push(data);
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
    this.currPageDialog += flipPage;
    return this.http.get<PaginatedResponse>(`${this.apiUrl}dialogs/?page=${this.currPageDialog}`);
  }

  // Request a list of messages that the user had received
  reqMessages(flipPage: number = 0) {
    this.currPageMessage += flipPage;
    return this.http.get<PaginatedResponse>(`${this.apiUrl}messages/?page=${this.currPageMessage}`);
  }

  send(data: string) {
    this.ws.send(JSON.stringify({ msg_type: 3, text: data, dialog_pk: '1', random_id: this.generateRandomId(), }));
  }


  get receivedEvt$(): Observable<MessageEvt> {
    return this.receivedEvt.asObservable();
  }

  private generateRandomId() {
    const r = Math.random();
    return -Math.floor(r * Math.pow(2, 31));
  }

}

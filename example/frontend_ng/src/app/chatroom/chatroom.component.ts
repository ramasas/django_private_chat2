import { AfterViewInit, Component, OnInit, ViewChild } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { MatSelectionList, MatSelectionListChange } from '@angular/material/list';
import { BehaviorSubject, catchError, map, of, Subject, switchMap, throttleTime, timer } from 'rxjs';
import { ChatroomService } from './chatroom.service';
import { Chatroom, MessageEvt, MessageTypes, TextMessageEvt, IsTypingEvt, TypingStoppedEvt, ChatroomMessage } from './chatroom.model';

@Component({
  selector: 'app-chatroom',
  templateUrl: './chatroom.component.html',
  styleUrls: ['./chatroom.component.scss']
})
export class ChatroomComponent implements OnInit, AfterViewInit {

  @ViewChild('chatroomList') chatroomList!: MatSelectionList;

  chatrooms: BehaviorSubject<Chatroom[]> = new BehaviorSubject<Chatroom[]>([]);
  messages: BehaviorSubject<ChatroomMessage[]> = new BehaviorSubject<ChatroomMessage[]>([]);
  extraMessages: BehaviorSubject<ChatroomMessage[]> = new BehaviorSubject<ChatroomMessage[]>([]);

  private isTyping = new Subject<string>();

  constructor(
    private fb: FormBuilder,
    private service: ChatroomService) {


    // Send isTyping or typingStopped event to the chatroom
    this.isTyping.asObservable()
      .pipe(
        throttleTime(5000),
        switchMap(event => {
          if (this.service.state.chatroom !== undefined) {
            this.service.send({
              msg_type: MessageTypes.IsTyping,
              dialog_pk: this.service.state.chatroom.id.toString()
            });
          }
          return timer(5000); // Delay for 5 seconds before sending typingStopped event
        }),
      )
      .subscribe(event => {
        if (this.service.state.chatroom !== undefined) {
          this.service.send({
            msg_type: MessageTypes.TypingStopped,
            dialog_pk: this.service.state.chatroom.id.toString()
          });
        }
      });

  }

  ngOnInit(): void {

  }

  ngAfterViewInit(): void {
    this.reqChatrooms();
    this.reqMessages();

    // Received new text message
    this.service.receivedEvt$.subscribe(this.handleReceivedEvt.bind(this));
  }

  reqChatrooms() {
    this.service.reqChatrooms()
      .pipe(catchError(e => {
        return of(null);
      }))
      .subscribe(res => {
        if (res == null) return;
        const data = res.data as Chatroom[];
        this.chatrooms.next(data);

        if (data.length) {
          this.service.state.chatroom = data[0];
        }
      });
  }

  reqMessages() {
    this.service.reqMessages()
      .pipe(catchError(e => {
        return of(null);
      }))
      .subscribe(res => {
        if (res == null) return;
        const data = res.data as {
          id: number,
          text: string,
          sent: Date,
          edited: Date,
          read: boolean,
          file?: {
            id: string,
            url: string,
            name: string,
            size: number,
          },
          sender: string,
          recipient: string,
          sender_username: string,
          out: boolean,
        }[];
        // Convert response into ChatroomMessage
        const messages = data.map(n => {
          return {
            id: n.id,
            type: n.file == null ? 'text' : 'file', // Support text or file message only
            message: n.text || '',
            reply: n.out,
            sender: n.sender,
            sender_username: n.sender_username,
            recipient: n.recipient,
            date: n.sent,
            files: n.file == null ? undefined : [n.file],
          } as ChatroomMessage;
        });

        this.messages.next(messages);
      });

  }

  handleReceivedEvt(evt: MessageEvt) {
    if (evt == null) return;

    switch (evt.msg_type) {
      case MessageTypes.IsTyping:
        this.handleIsTypingEvt(evt as IsTypingEvt);
        break;
      case MessageTypes.TypingStopped:
        this.handleTypingStoppedEvt(evt as TypingStoppedEvt);
        break;
      case MessageTypes.TextMessage:
        this.handleTextMessageEvt(evt as TextMessageEvt);
        break;
    }

  }

  selectChatroom(event: MatSelectionListChange) {
    this.service.state.chatroom = event.options[0].value;

  }

  onInputChange(event: string) {
    this.isTyping.next(event);
  }

  sendMessage(event: any) {
    if (this.state.chatroom === undefined) return;
    
    /*const files = !event.files ? [] : event.files.map((file: any) => {
      return {
        url: file.src,
        type: file.type,
        icon: 'file-text-outline',
      };
    });*/
    const files = !event.files ? [] : event.files;

    if (files.length) {
      console.log(event, files);
      this.uploadFiles(files);
      // File message
      /*this.service.sendFileMessage({
        text: event.message,
        dialog_pk: this.state.chatroom.id.toString(),
      });*/

    } else {
      // Text message
      this.service.sendTextMessage({
        text: event.message,
        dialog_pk: this.state.chatroom.id.toString(),
      });
    }
  }

  get chatrooms$() {
    return this.chatrooms.asObservable();

  }

  get messages$() {
    //console.log(this.messages.value, this.service.state.chatroom)
    return this.messages.asObservable()
      .pipe(map(arr => arr.filter(n => parseInt(n.recipient) === this.service.state.chatroom?.id)));

  }

  get extraMessages$() {
    //console.log(this.messages.value, this.service.state.chatroom)
    return this.extraMessages.asObservable()
      .pipe(map(arr => arr.filter(n => parseInt(n.recipient) === this.service.state.chatroom?.id)));

  }

  get state() {
    return this.service.state;
  }

  private uploadFiles(files: File[]) {
    this.service.uploadFiles(files).subscribe(res => {
      console.log(res);
    });
    /*uploadFile(e.target.files, getCookie()).then((r) => {
      if (r.tag === 0) {
        console.log("Uploaded file :")
        console.log(r.fields[0])
        let user_pk = this.state.selectedDialog.id;
        let uploadResp = r.fields[0];
        let msgBox = sendOutgoingFileMessage(this.state.socket, user_pk, uploadResp, this.state.selfInfo);
        console.log("sendOutgoingFileMessage result:");
        console.log(msgBox);
        if (msgBox) {
          this.addMessage(msgBox);
        }
      } else {
        console.log("File upload error")
        toast.error(r.fields[0])
      }
    });*/
  }

  private handleIsTypingEvt(evt: IsTypingEvt) {
    if (this.state.chatroom === undefined) return;

    const idx = this.state.chatroom?.other_user_id.findIndex(n => n === evt.user_pk);
    if (idx < 0) return;

    const typer = parseInt(this.state.chatroom?.other_user_id[idx]);
    const typer_username = this.state.chatroom?.username[idx];

    const newMessage: ChatroomMessage = {
      id: typer,
      type: 'typing',
      message: '',
      customMessageData: { typer: typer, typer_username: typer_username },
      reply: false,
      sender: evt.user_pk,
      sender_username: typer_username,
      recipient: this.state.chatroom.id.toString(),
      date: new Date(),
    } as ChatroomMessage;

    //console.log(evt, newMessage);
    const extra = this.extraMessages.value;
    this.extraMessages.next([
      ...extra.filter(n => !(n.recipient === this.state.chatroom?.id.toString() && n.id === typer)),
      newMessage
    ]);
    
  }

  private handleTypingStoppedEvt(evt: TypingStoppedEvt) {
    if (this.state.chatroom === undefined) return;

    const idx = this.state.chatroom?.other_user_id.findIndex(n => n === evt.user_pk);
    if (idx < 0) return;

    const typer = parseInt(this.state.chatroom?.other_user_id[idx]);

    const extra = this.extraMessages.value;
    this.extraMessages.next([
      ...extra.filter(n => !(n.recipient === this.state.chatroom?.id.toString() && n.id === typer)),
    ]);

  }

  private handleTextMessageEvt(evt: TextMessageEvt) {

    const newMessage: ChatroomMessage = {
      id: evt.random_id,
      type: 'text',
      message: evt.text,
      reply: evt.sender_username === this.state.self_username,
      sender: evt.sender,
      sender_username: evt.sender_username,
      recipient: evt.receiver,
      date: new Date(),
    } as ChatroomMessage;

    //console.log(evt, newMessage);
    this.messages.next([...this.messages.value, newMessage]);
  }

}

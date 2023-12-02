import { AfterViewInit, Component, OnInit, ViewChild } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { MatSelectionList, MatSelectionListChange } from '@angular/material/list';
import { BehaviorSubject, catchError, map, of, Subject, switchMap, throttleTime, timer } from 'rxjs';
import { ChatroomService } from './chatroom.service';
import { Chatroom, TextMessage, MessageEvt, MessageTypes, TextMessageEvt, IsTypingEvt, TypingStoppedEvt, ChatroomMessage } from './chatroom.model';

@Component({
  selector: 'app-chatroom',
  templateUrl: './chatroom.component.html',
  styleUrls: ['./chatroom.component.scss']
})
export class ChatroomComponent implements OnInit, AfterViewInit {

  @ViewChild('chatroomList') chatroomList!: MatSelectionList;

  chatrooms: BehaviorSubject<Chatroom[]> = new BehaviorSubject<Chatroom[]>([]);
  messages: BehaviorSubject<TextMessage[]> = new BehaviorSubject<TextMessage[]>([]);

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
        const data = res.data as TextMessage[];
        this.messages.next(data);
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
    console.log(event);
    //this.service.send({
    //  msg_type: MessageTypes.IsTyping,
    //});
  }

  sendMessage(event: any) {
    if (this.service.state.chatroom === undefined) return;

    const files = !event.files ? [] : event.files.map((file: any) => {
      return {
        url: file.src,
        type: file.type,
        icon: 'file-text-outline',
      };
    });

    if (files.length) {
      // File message
      this.service.send({
        msg_type: MessageTypes.FileMessage,
        text: event.message,
        dialog_pk: this.service.state.chatroom.id.toString(),
      });

    } else {
      // Text message
      this.service.send({
        msg_type: MessageTypes.TextMessage,
        text: event.message,
        dialog_pk: this.service.state.chatroom.id.toString(),
      });
    }

    /*const files = !event.files ? [] : event.files.map((file) => {
      return {
        url: file.src,
        type: file.type,
        icon: 'file-text-outline',
      };
    });

    this.messages.push({
      text: event.message,
      date: new Date(),
      reply: true,
      type: files.length ? 'file' : 'text',
      files: files,
      user: {
        name: 'Jonh Doe',
        avatar: 'https://i.gifer.com/no.gif',
      },
    });
    const botReply = this.chatShowcaseService.reply(event.message);
    if (botReply) {
      setTimeout(() => { this.messages.push(botReply) }, 500);
    }*/
  }

  get chatrooms$() {
    return this.chatrooms.asObservable();

  }

  get messages$() {
    //console.log(this.messages.value, this.service.state.chatroom)
    return this.messages.asObservable()
      .pipe(map(arr => arr.filter(n => parseInt(n.recipient) === this.service.state.chatroom?.id)));

  }

  get state() {
    return this.service.state;
  }

  private handleIsTypingEvt(evt: IsTypingEvt) {

    /*const newMessage: ChatroomMessage = {
      text: '...',
      sender: evt.sender,
      sender_username: evt.sender_username,
      recipient: evt.receiver,
      out: false,
    };*/

  }

  private handleTypingStoppedEvt(evt: TypingStoppedEvt) {

  }

  private handleTextMessageEvt(evt: TextMessageEvt) {

    const newMessage: TextMessage = {
      id: evt.random_id,
      text: evt.text,
      sent: new Date(),
      edited: new Date(),
      read: true,
      file: null,
      sender: evt.sender,
      sender_username: evt.sender_username,
      recipient: evt.receiver,
      out: evt.sender_username === this.state.self_username,
    };
    //console.log(evt, newMessage);
    this.messages.next([...this.messages.value, newMessage]);
  }

}

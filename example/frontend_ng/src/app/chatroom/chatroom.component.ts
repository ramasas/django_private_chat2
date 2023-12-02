import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, Validators } from '@angular/forms';
import { BehaviorSubject, catchError, of } from 'rxjs';
import { Chatroom, ChatroomService, TextMessage, MessageEvt, MessageTypes, TextMessageEvt } from './chatroom.service';

@Component({
  selector: 'app-chatroom',
  templateUrl: './chatroom.component.html',
  styleUrls: ['./chatroom.component.scss']
})
export class ChatroomComponent implements OnInit {

  self?: { username: string, pk: number };
  chatrooms: BehaviorSubject<Chatroom[]> = new BehaviorSubject<Chatroom[]>([]);
  messages: BehaviorSubject<TextMessage[]> = new BehaviorSubject<TextMessage[]>([]);
  //messages: BehaviorSubject<TextMessageEvt[]> = new BehaviorSubject<TextMessageEvt[]>([]);

  formGroup = this.fb.group({
    chatroom: new FormControl<Chatroom | undefined>(undefined),
    message: ['', Validators.required],
  });

  constructor(
    private fb: FormBuilder,
    private service: ChatroomService) {

    this.service.reqSelf()
      .pipe(catchError(e => {
        return of(null);
      }))
      .subscribe(res => {
        if (res == null) return;
        this.self = res;
      });

  }

  ngOnInit(): void {
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
        const currChatroom = this.formGroup.value.chatroom;
        if (!currChatroom) {
          //this.formGroup.patchValue({ chatroom: data[0] });
          console.log(currChatroom, data[0], this.formGroup.value)
        }

        this.chatrooms.next(data);
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
      case MessageTypes.TextMessage:
        const textEvt = evt as TextMessageEvt;
        const newMessage: TextMessage = {
          id: textEvt.random_id,
          text: textEvt.text,
          sent: new Date(),
          edited: new Date(),
          read: true,
          file: null,
          sender: textEvt.sender,
          sender_username: textEvt.sender_username,
          recipient: textEvt.receiver,
          out: textEvt.sender_username == this.self?.username,
        };
        //console.log(textEvt, newMessage);
        this.messages.next([...this.messages.value, newMessage]);

        break;
    }

  }

  send() {
    if (!!this.formGroup.value.message) {
      this.service.send(this.formGroup.value.message);
    }
  }

  sendMessage(event: any) {
    this.service.send(event.message);
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
    return this.messages.asObservable();

  }

}

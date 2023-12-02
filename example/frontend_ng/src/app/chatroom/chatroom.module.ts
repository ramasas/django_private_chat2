import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { ChatroomRoutingModule } from './chatroom-routing.module';
import { ChatroomComponent } from './chatroom.component';
import { MaterialModule } from '../material.module';
import { NbChatModule, NbFocusMonitor, NbStatusService, NbThemeModule } from '@nebular/theme';

@NgModule({
  declarations: [
    ChatroomComponent,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MaterialModule,
    NbThemeModule.forRoot(),
    NbChatModule,
    ChatroomRoutingModule,
  ],
  providers: [
    NbStatusService,
    NbFocusMonitor,
  ]
})
export class ChatroomModule { }

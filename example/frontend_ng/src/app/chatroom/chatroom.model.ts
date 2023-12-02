
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

export interface IsTypingEvt extends MessageEvt {
  user_pk: string; // actually int
}


export interface TypingStoppedEvt extends MessageEvt {
  user_pk: string; // actually int
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

export interface ChatroomMessage {
  text: string;
  sender: string; // actually int
  sender_username: string;
  recipient: string;  // actuall int
  out: boolean;
}

export interface TextMessage extends ChatroomMessage {
  id: number;
  //text: string;
  sent: Date;
  edited: Date;
  read: boolean;
  file: any;
  //sender: string; // actually int
  //sender_username: string;
  //recipient: string;  // actuall int
  //out: boolean;
}

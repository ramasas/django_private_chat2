import json
from typing import Optional, Dict, Tuple
from channels.db import database_sync_to_async

from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth.models import AbstractBaseUser, User

from .db_operations import get_dialogs_to_add, get_unread_count, \
    get_user_by_pk, get_dialog_by_pk, get_file_by_id, get_message_by_id, \
    save_file_message, save_text_message, mark_message_as_read
from .message_types import MessageTypes, MessageTypeMessageRead, MessageTypeFileMessage, MessageTypeTextMessage, \
    MessageTypeIsTyping, MessageTypeTypingStopped, \
    OutgoingEventMessageRead, OutgoingEventNewTextMessage, OutgoingEventNewUnreadCount, OutgoingEventMessageIdCreated,\
    OutgoingEventNewFileMessage, OutgoingEventIsTyping, OutgoingEventStoppedTyping, OutgoingEventWentOnline, OutgoingEventWentOffline

from .errors import ErrorTypes, ErrorDescription
from django_private_chat2.models import MessageModel, DialogsModel, UploadedFile
from django_private_chat2.serializers import serialize_file_model
from django.conf import settings
import logging

logger = logging.getLogger('django_private_chat2.chat_consumer')
TEXT_MAX_LENGTH = getattr(settings, 'TEXT_MAX_LENGTH', 65535)
UNAUTH_REJECT_CODE: int = 4001

class ChatConsumer(AsyncWebsocketConsumer):
    async def _after_message_save(self, msg: MessageModel, rid: int, dialog_pk: str):
        # New message is saved
        # Let's fire events to all members in the dialog group    
        ev = OutgoingEventMessageIdCreated(random_id=rid, db_id=msg.id)._asdict()
        async for member in msg.recipient.users.all():
            logger.info(f"Message with id {msg.id} saved, firing events to member {member.pk}")
            await self.channel_layer.group_send(str(member.pk), ev)
        
            new_unreads = await get_unread_count(dialog_pk, member.pk)
            await self.channel_layer.group_send(str(member.pk),
                                                OutgoingEventNewUnreadCount(
                                                    sender=self.group_name,
                                                    unread_count=new_unreads
                                                )._asdict())
              

    async def broadcast(self, dialog_pk: int, ev, exclude_self=False):
        members = (await DialogsModel.objects.aget(id=dialog_pk)).users.all()
        async for member in members:
            if exclude_self and self.user.pk == member.pk:
                continue
            await self.channel_layer.group_send(str(member.pk), ev)
        #dialog = await database_sync_to_async(DialogsModel.objects.aget)(id=dialog_pk)
        #async for member in (await dialog).users.all():
            

    async def connect(self):
        # TODO:
        # 1. Set user online
        # 2. Notify other users that the user went online
        # 3. Add the user to all groups where he has dialogs
        # Call self.scope["session"].save() on any changes to User
        if self.scope["user"].is_authenticated:
            self.user: AbstractBaseUser = self.scope['user']
            self.group_name: str = str(self.user.pk)
            self.sender_username: str = self.user.get_username()
            logger.info(f"User {self.user.pk} connected, adding {self.channel_name} to {self.group_name}")
            await self.channel_layer.group_add(self.group_name, self.channel_name)
            await self.accept()
            # Notify other users in dialog groups that the user went online
            dialogs = await get_dialogs_to_add(self.user)
            logger.info(f"User {self.user.pk} connected, sending 'user_went_online' to {dialogs} dialog groups")
            for d in dialogs:  # type: int
                if str(d) != self.group_name:
                    #await self.channel_layer.group_send(str(d), OutgoingEventWentOnline(user_pk=str(self.user.pk))._asdict())
                    await self.broadcast(d, OutgoingEventWentOnline(user_pk=str(self.user.pk))._asdict())
                    
        else:
            logger.info(f"Rejecting unauthenticated user with code {UNAUTH_REJECT_CODE}")
            await self.close(code=UNAUTH_REJECT_CODE)

    async def disconnect(self, close_code):
        # TODO:
        # Set user offline
        # Save user was_online
        # Notify other users that the user went offline
        if close_code != UNAUTH_REJECT_CODE and getattr(self, 'user', None) is not None:
            logger.info(
                f"User {self.user.pk} disconnected, removing channel {self.channel_name} from group {self.group_name}")
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
            dialogs = await get_dialogs_to_add(self.user)
            logger.info(f"User {self.user.pk} disconnected, sending 'user_went_offline' to {dialogs} dialog groups")
            for d in dialogs:
                #await self.channel_layer.group_send(str(d), OutgoingEventWentOffline(user_pk=str(self.user.pk))._asdict())
                await self.broadcast(d, OutgoingEventWentOffline(user_pk=str(self.user.pk))._asdict())

    async def handle_received_message(self, msg_type: MessageTypes, data: Dict[str, str]) -> Optional[ErrorDescription]:
        logger.info(f"Received message type {msg_type.name} from user {self.group_name} with data {data}")
        if msg_type == MessageTypes.WentOffline \
            or msg_type == MessageTypes.WentOnline \
            or msg_type == MessageTypes.MessageIdCreated \
            or msg_type == MessageTypes.ErrorOccurred:
            logger.info(f"Ignoring message {msg_type.name}")
        else:
            if msg_type == MessageTypes.IsTyping:
                data: MessageTypeIsTyping
                if 'dialog_pk' not in data:
                    return ErrorTypes.MessageParsingError, "'dialog_pk' not present in data"
                elif 'dialog_pk' in data and not isinstance(data['dialog_pk'], str):
                    return ErrorTypes.InvalidDialogPk, "'dialog_pk' should be a string"
                else:
                    dialog_pk = data['dialog_pk'] if 'dialog_pk' in data else None
                    #dialogs = await get_dialogs_to_add(self.user)
                    recipient: Optional[DialogsModel] = await get_dialog_by_pk(dialog_pk)
                    logger.info(f"DB check if discussion group {dialog_pk} exists resulted in {recipient}")
                    if not recipient:
                        return ErrorTypes.InvalidDialogPk, f"Discussion group with pk {dialog_pk} does not exist"
                    else:
                        logger.info(f"User {self.user.pk} is typing, sending 'is_typing' to {recipient.pk} dialog groups")
                        await self.broadcast(recipient.pk, OutgoingEventIsTyping(user_pk=str(self.user.pk))._asdict(), True)
                        #for d in dialogs:
                        #    if str(d) != self.group_name:
                        #        #await self.channel_layer.group_send(str(d), OutgoingEventIsTyping(user_pk=str(self.user.pk))._asdict())
                        #        await self.broadcast(d, OutgoingEventIsTyping(user_pk=str(self.user.pk))._asdict())
                return None
            
            elif msg_type == MessageTypes.TypingStopped:
                data: MessageTypeTypingStopped
                if 'dialog_pk' not in data:
                    return ErrorTypes.MessageParsingError, "'dialog_pk' not present in data"
                elif 'dialog_pk' in data and not isinstance(data['dialog_pk'], str):
                    return ErrorTypes.InvalidDialogPk, "'dialog_pk' should be a string"
                else:
                    dialog_pk = data['dialog_pk'] if 'dialog_pk' in data else None
                    #dialogs = await get_dialogs_to_add(self.user)
                    recipient: Optional[DialogsModel] = await get_dialog_by_pk(dialog_pk)
                    logger.info(f"DB check if discussion group {dialog_pk} exists resulted in {recipient}")
                    if not recipient:
                        return ErrorTypes.InvalidDialogPk, f"Discussion group with pk {dialog_pk} does not exist"
                    else:
                        logger.info(
                            f"User {self.user.pk} has stopped typing, sending 'stopped_typing' to {recipient.pk} dialog groups")
                        await self.broadcast(recipient.pk, OutgoingEventStoppedTyping(user_pk=str(self.user.pk))._asdict(), True)
                        #for d in dialogs:
                        #    if str(d) != self.group_name:
                        #        #await self.channel_layer.group_send(str(d), OutgoingEventStoppedTyping(user_pk=str(self.user.pk))._asdict())
                        #        await self.broadcast(d, OutgoingEventStoppedTyping(user_pk=str(self.user.pk))._asdict())
                return None
            
            elif msg_type == MessageTypes.MessageRead:
                data: MessageTypeMessageRead
                if 'dialog_pk' not in data:
                    return ErrorTypes.MessageParsingError, "'dialog_pk' not present in data"
                elif 'message_id' not in data:
                    return ErrorTypes.MessageParsingError, "'message_id' not present in data"
                elif 'dialog_pk' in data and not isinstance(data['dialog_pk'], str):
                    return ErrorTypes.InvalidDialogPk, "'dialog_pk' should be a string"
                elif not isinstance(data['message_id'], int):
                    return ErrorTypes.InvalidRandomId, "'message_id' should be an int"
                elif data['message_id'] <= 0:
                    return ErrorTypes.InvalidMessageReadId, "'message_id' should be > 0"
                #elif 'user_pk' in data and data['user_pk'] == self.group_name:
                #    return ErrorTypes.InvalidUserPk, "'user_pk' can't be self  (you can't mark self messages as read)"
                else:
                    dialog_pk = data['dialog_pk'] if 'dialog_pk' in data else None
                    mid = data['message_id']

                    logger.info(
                        f"Validation passed, marking msg from {dialog_pk} to {self.group_name} with id {mid} as read")

                    await self.broadcast(int(dialog_pk),
                                         OutgoingEventMessageRead(message_id=mid,
                                                                  sender=dialog_pk,
                                                                  receiver=self.group_name)._asdict())
                    #await self.channel_layer.group_send(
                    #    dialog_pk,
                    #    OutgoingEventMessageRead(message_id=mid,
                    #                             sender=dialog_pk,
                    #                             receiver=self.group_name)._asdict())
                    recipient: Optional[DialogsModel] = await get_dialog_by_pk(dialog_pk)
                    logger.info(f"DB check if discussion group {dialog_pk} exists resulted in {recipient}")
                    if not recipient:
                        return ErrorTypes.InvalidDialogPk, f"Discussion group with pk {dialog_pk} does not exist"
                    else:
                        msg_res: Optional[Tuple[str, str]] = await get_message_by_id(mid)
                        if not msg_res:
                            return ErrorTypes.InvalidMessageReadId, f"Message with id {mid} does not exist"
                        elif msg_res[0] != self.group_name or msg_res[1] != user_pk:
                            return ErrorTypes.InvalidMessageReadId, f"Message with id {mid} was not sent by {dialog_pk} to {self.group_name}"
                        else:
                            await mark_message_as_read(mid, self.group_name)
                            new_unreads = await get_unread_count(dialog_pk, self.group_name)
                            await self.channel_layer.group_send(
                                self.group_name,
                                OutgoingEventNewUnreadCount(sender=dialog_pk,
                                                            unread_count=new_unreads)._asdict())
                            # await mark_message_as_read(mid, sender_pk=user_pk, recipient_pk=self.group_name)
                return None
            
            elif msg_type == MessageTypes.FileMessage:
                data: MessageTypeFileMessage
                if 'file_id' not in data:
                    return ErrorTypes.MessageParsingError, "'file_id' not present in data"
                elif 'dialog_pk' not in data:
                    return ErrorTypes.MessageParsingError, "'dialog_pk' not present in data"
                elif 'random_id' not in data:
                    return ErrorTypes.MessageParsingError, "'random_id' not present in data"
                elif data['file_id'] == '':
                    return ErrorTypes.FileMessageInvalid, "'file_id' should not be blank"
                elif not isinstance(data['file_id'], str):
                    return ErrorTypes.FileMessageInvalid, "'file_id' should be a string"
                elif 'dialog_pk' in data and not isinstance(data['dialog_pk'], str):
                    return ErrorTypes.InvalidDialogPk, "'dialog_pk' should be a string"
                elif not isinstance(data['random_id'], int):
                    return ErrorTypes.InvalidRandomId, "'random_id' should be an int"
                elif data['random_id'] > 0:
                    return ErrorTypes.InvalidRandomId, "'random_id' should be negative"
                else:
                    file_id = data['file_id']
                    dialog_pk = data['dialog_pk'] if 'dialog_pk' in data else None
                    rid = data['random_id']
                    # We can't send the message right away like in the case with text message
                    # because we don't have the file url.
                    file: Optional[UploadedFile] = await get_file_by_id(file_id)
                    logger.info(f"DB check if file {file_id} exists resulted in {file}")
                    if not file:
                        return ErrorTypes.FileDoesNotExist, f"File with id {file_id} does not exist"
                    else:
                        recipient: Optional[DialogsModel] = await get_dialog_by_pk(dialog_pk)
                        logger.info(f"DB check if discussion group {dialog_pk} exists resulted in {recipient}")
                        if not recipient:
                            return ErrorTypes.InvalidDialogPk, f"Discussion group with pk {dialog_pk} does not exist"
                        else:
                            logger.info(f"Will save file message from {self.user} to {recipient}")
                            msg = await save_file_message(file,
                                                          from_=self.user, to=recipient)
                            await self._after_message_save(msg, rid=rid, dialog_pk=dialog_pk)
                            logger.info(f"Sending file message for file {file_id} from {self.user} to {recipient}")
                            # We don't need to send random_id here because we've already saved the file to db
                            await self.broadcast(
                                dialog_pk, OutgoingEventNewFileMessage(db_id=msg.id,
                                                               file=serialize_file_model(file),
                                                               sender=self.group_name,
                                                               sender_username=self.sender_username,
                                                               receiver=dialog_pk,)._asdict())
                            """
                            await self.channel_layer.group_send(
                                dialog_pk,
                                OutgoingEventNewFileMessage(db_id=msg.id, 
                                                            file=serialize_file_model(file),
                                                            sender=self.group_name,
                                                            sender_username=self.sender_username,
                                                            receiver=dialog_pk,
                                                            )._asdict())
                                """                            

            elif msg_type == MessageTypes.TextMessage:
                data: MessageTypeTextMessage
                if 'text' not in data:
                    return ErrorTypes.MessageParsingError, "'text' not present in data"
                elif 'dialog_pk' not in data:
                    return ErrorTypes.MessageParsingError, "'dialog_pk' not present in data"
                elif 'random_id' not in data:
                    return ErrorTypes.MessageParsingError, "'random_id' not present in data"
                elif data['text'] == '':
                    return ErrorTypes.TextMessageInvalid, "'text' should not be blank"
                elif len(data['text']) > TEXT_MAX_LENGTH:
                    return ErrorTypes.TextMessageInvalid, "'text' is too long"
                elif not isinstance(data['text'], str):
                    return ErrorTypes.TextMessageInvalid, "'text' should be a string"
                elif 'dialog_pk' in data and not isinstance(data['dialog_pk'], str):
                    return ErrorTypes.InvalidDialogPk, "'dialog_pk' should be a string"
                elif not isinstance(data['random_id'], int):
                    return ErrorTypes.InvalidRandomId, "'random_id' should be an int"
                elif data['random_id'] > 0:
                    return ErrorTypes.InvalidRandomId, "'random_id' should be negative"
                else:
                    text = data['text']
                    dialog_pk = data['dialog_pk'] if 'dialog_pk' in data else None
                    rid = data['random_id']
                    
                    # first we send data to channel layer to not perform any synchronous operations,
                    # and only after we do sync DB stuff
                    # We need to create a 'random id' - a temporary id for the message, which is not yet
                    # saved to the database. I.e. for the client it is 'pending delivery' and can be
                    # considered delivered only when it's saved to database and received a proper id,
                    # which is then broadcast separately both to sender & receiver.
                    logger.info(f"Validation passed, sending text message from {self.group_name} to {dialog_pk}")
                    await self.broadcast(
                        dialog_pk, OutgoingEventNewTextMessage(random_id=rid,
                                                               text=text,
                                                               sender=self.group_name,
                                                               sender_username=self.sender_username,
                                                               receiver=dialog_pk,)._asdict())
                    """
                    await self.channel_layer.group_send(dialog_pk, 
                                                        OutgoingEventNewTextMessage(
                        random_id=rid,
                        text=text,
                        sender=self.group_name,
                        sender_username=self.sender_username,
                        receiver=dialog_pk,
                        )._asdict())
                        """
                        
                    recipient: Optional[AbstractBaseUser] = await get_dialog_by_pk(dialog_pk)
                    logger.info(f"DB check if discussion group {dialog_pk} exists resulted in {recipient}")
                    if not recipient:
                        return ErrorTypes.InvalidDialogPk, f"Discussion group with pk {dialog_pk} does not exist"
                    else:
                        logger.info(f"Will save text message from {self.user} to {recipient}")
                        msg = await save_text_message(text,
                                                      from_=self.user, to=recipient)
                        await self._after_message_save(msg, rid=rid, dialog_pk=dialog_pk)
                            
                    

    # Receive message from WebSocket
    async def receive(self, text_data=None, bytes_data=None):
        logger.info(f"Receive fired")
        error: Optional[ErrorDescription] = None
        try:
            text_data_json = json.loads(text_data)
            logger.info(f"From {self.group_name} received '{text_data_json}")
            if not ('msg_type' in text_data_json):
                error = (ErrorTypes.MessageParsingError, "msg_type not present in json")
            else:
                msg_type = text_data_json['msg_type']
                if not isinstance(msg_type, int):
                    error = (ErrorTypes.MessageParsingError, "msg_type is not an int")
                else:
                    try:
                        msg_type_case: MessageTypes = MessageTypes(msg_type)
                        error = await self.handle_received_message(msg_type_case, text_data_json)
                    except ValueError as e:
                        error = (ErrorTypes.MessageParsingError, f"msg_type decoding error - {e}")
        except json.JSONDecodeError as e:
            error = (ErrorTypes.MessageParsingError, f"jsonDecodeError - {e}")
        if error is not None:
            error_data = {
                'msg_type': MessageTypes.ErrorOccurred,
                'error': error
            }
            logger.info(f"Will send error {error_data} to {self.group_name}")
            await self.send(text_data=json.dumps(error_data))

    async def new_unread_count(self, event: dict):
        await self.send(text_data=OutgoingEventNewUnreadCount(**event).to_json())

    async def message_read(self, event: dict):
        await self.send(text_data=OutgoingEventMessageRead(**event).to_json())

    async def message_id_created(self, event: dict):
        await self.send(text_data=OutgoingEventMessageIdCreated(**event).to_json())

    async def new_text_message(self, event: dict):
        await self.send(text_data=OutgoingEventNewTextMessage(**event).to_json())

    async def new_file_message(self, event: dict):
        await self.send(text_data=OutgoingEventNewFileMessage(**event).to_json())

    async def is_typing(self, event: dict):
        await self.send(text_data=OutgoingEventIsTyping(**event).to_json())

    async def stopped_typing(self, event: dict):
        await self.send(text_data=OutgoingEventStoppedTyping(**event).to_json())

    async def user_went_online(self, event):
        await self.send(text_data=OutgoingEventWentOnline(**event).to_json())

    async def user_went_offline(self, event):
        await self.send(text_data=OutgoingEventWentOffline(**event).to_json())

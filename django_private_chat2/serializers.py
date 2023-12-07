from .models import MessageModel, MessageReadModel, DialogsModel, UserModel, UploadedFile
from typing import Optional, Dict
import os

def serialize_files_model(files: list[UploadedFile]) -> list[dict[str, str]]:
    serialized_files = []
    for file in files:
        print(file)
        serialized_files.append({
            'id': str(file.id),
            'url': file.file.url,
            'size': file.file.size,
            'name': os.path.basename(file.file.name)
        })
    return serialized_files


def serialize_file_model(m: UploadedFile) -> Dict[str, str]:
    return {'id': str(m.id), 'url': m.file.url,
            'size': m.file.size, 'name': os.path.basename(m.file.name)}


def serialize_message_model(m: MessageModel, user_id):
    sender_pk = m.sender.pk
    is_out = sender_pk == user_id
    message_read = MessageReadModel.objects.filter(message__id=m.id, recipient__id=user_id).first()
    # TODO: add forwards
    # TODO: add replies
    obj = {
        "id": m.id,
        "text": m.text,
        "sent": int(m.created.timestamp()) * 1000,
        "edited": int(m.modified.timestamp()) * 1000,
        "read": message_read.read if message_read else True,
        "file": serialize_file_model(m.file) if m.file else None,
        "sender": str(sender_pk),
        "recipient": str(m.recipient.pk),
        "out": is_out,
        "sender_username": m.sender.get_username()
    }
    return obj


def serialize_dialog_model(m: DialogsModel, user_id):
    username_field = UserModel.USERNAME_FIELD
    qs = m.users.values_list('pk', username_field).exclude(pk=user_id)
    other_users_pk = [value[0] for value in qs]
    other_users_username = [value[1] for value in qs]
    
    unread_count = MessageReadModel.get_unread_count_for_dialog_with_user(dialog=m.pk, recipient=user_id)
    last_message: Optional[MessageModel] = MessageReadModel.get_last_message_for_dialog(dialog=m.pk, recipient=user_id)
    last_message_ser = serialize_message_model(last_message, user_id) if last_message else None
    obj = {
        "id": m.id,
        "name": m.name,
        "description": m.description,
        "created": int(m.created.timestamp()) * 1000,
        "modified": int(m.modified.timestamp()) * 1000,
        "other_user_id": [str(pk) for pk in other_users_pk], 
        "unread_count": unread_count,
        "username": [str(username) for username in other_users_username],
        "last_message": last_message_ser
    }
    return obj

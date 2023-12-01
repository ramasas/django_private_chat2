# -*- coding: utf-8 -*-

from django.contrib.admin import ModelAdmin, site
from .models import MessageModel, DialogsModel


class MessageModelAdmin(ModelAdmin):
    readonly_fields = ('created', 'modified',)
    search_fields = ('id', 'text', 'sender__pk', 'recipient__pk')
    list_display = ('id', 'sender', 'recipient', 'text', 'file')
    list_display_links = ('id',)
    list_filter = ('sender', 'recipient')
    date_hierarchy = 'created'


class DialogsModelAdmin(ModelAdmin):
    readonly_fields = ('created', 'modified',)
    search_fields = ('id', 'users__pk')
    list_display = ('id', )
    list_display_links = ('id',)
    date_hierarchy = 'created'

    def members(self, obj):
        return ', '.join([str(users) for users in obj.users.all()])
    
    members.short_description = 'Group Members'
    

site.register(DialogsModel, DialogsModelAdmin)
site.register(MessageModel, MessageModelAdmin)

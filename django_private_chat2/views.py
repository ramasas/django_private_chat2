# -*- coding: utf-8 -*-
from mailbox import Message
from django.views.generic import (
    CreateView,
    DeleteView,
    DetailView,
    UpdateView,
    ListView,

)
from .models import (
    MessageModel,
    DialogsModel,
    UploadedFile
)
from .serializers import serialize_message_model, serialize_dialog_model, serialize_files_model
from django.db.models import Q

from django.contrib.auth.mixins import LoginRequiredMixin

from django.http import HttpResponse, JsonResponse, HttpResponseRedirect, HttpResponseBadRequest
from django.core.paginator import Page, Paginator
from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser
from django.urls import reverse_lazy
from django import forms
from django.forms import ModelForm
import json


class MessagesModelList(LoginRequiredMixin, ListView):
    http_method_names = ['get', ]
    paginate_by = getattr(settings, 'MESSAGES_PAGINATION', 500)

    def get_queryset(self):
        dialogs = DialogsModel.get_dialogs_for_user(self.request.user)
        qs = MessageModel.objects.filter(recipient__in=dialogs).prefetch_related('sender', 'recipient', 'file')

        return qs.order_by('created')

    def render_to_response(self, context, **response_kwargs):
        user_pk = self.request.user.pk
        data = [serialize_message_model(i, user_pk) for i in context['object_list']]
        page: Page = context.pop('page_obj')
        paginator: Paginator = context.pop('paginator')
        return_data = {
            'page': page.number,
            'pages': paginator.num_pages,
            'data': data
        }
        return JsonResponse(return_data, **response_kwargs)


class DialogsModelList(LoginRequiredMixin, ListView):
    http_method_names = ['get', ]
    paginate_by = getattr(settings, 'DIALOGS_PAGINATION', 20)

    def get_queryset(self):
        qs = DialogsModel.objects.filter(users__in=[self.request.user.pk]) \
            .prefetch_related('users')
        return qs.order_by('-created')

    def render_to_response(self, context, **response_kwargs):
        # TODO: add online status
        user_pk = self.request.user.pk
        data = [serialize_dialog_model(i, user_pk) for i in context['object_list']]
        page: Page = context.pop('page_obj')
        paginator: Paginator = context.pop('paginator')
        return_data = {
            'page': page.number,
            'pages': paginator.num_pages,
            'data': data
        }
        return JsonResponse(return_data, **response_kwargs)


class SelfInfoView(LoginRequiredMixin, DetailView):
    def get_object(self, queryset=None):
        return self.request.user

    def render_to_response(self, context, **response_kwargs):
        user: AbstractBaseUser = context['object']
        data = {
            "username": user.get_username(),
            "pk": str(user.pk)
        }
        return JsonResponse(data, **response_kwargs)


# 2.5MB - 2621440
# 5MB - 5242880
# 10MB - 10485760
# 20MB - 20971520
# 50MB - 5242880
# 100MB 104857600
# 250MB - 214958080
# 500MB - 429916160
# MAX_UPLOAD_SIZE = getattr(settings, 'MAX_FILE_UPLOAD_SIZE', 5242880)

class MultipleFileInput(forms.ClearableFileInput):
    allow_multiple_selected = True

class MultipleFileField(forms.FileField):
    def __init__(self, *args, **kwargs):
        kwargs.setdefault("widget", MultipleFileInput())
        super().__init__(*args, **kwargs)

    def clean(self, data, initial=None):
        single_file_clean = super().clean
        if isinstance(data, (list, tuple)):
            result = [single_file_clean(d, initial) for d in data]
        else:
            result = single_file_clean(data, initial)
        return result

class UploadForm(ModelForm):
    files = MultipleFileField()
    # TODO: max file size validation
    # def check_file(self):
    #     content = self.cleaned_data["file"]
    #     content_type = content.content_type.split('/')[0]
    #     if (content._size > MAX_UPLOAD_SIZE):
    #         raise forms.ValidationError(_("Please keep file size under %s. Current file size %s")%(filesizeformat(MAX_UPLOAD_SIZE), filesizeformat(content._size)))
    #     return content
    #
    # def clean(self):

    class Meta:
        model = UploadedFile
        fields = ['files']


class UploadView(LoginRequiredMixin, CreateView):
    http_method_names = ['post', ]
    model = UploadedFile
    form_class = UploadForm

    def form_valid(self, form: UploadForm):
        files = self.request.FILES.getlist('files')
        uploaded_files = []
        print('~~~~~~~~~', files)
        for file in files:
            uploaded_file = UploadedFile.objects.create(uploaded_by=self.request.user, file=file)
            uploaded_files.append(uploaded_file)
        serialized_files = serialize_files_model(uploaded_files)
        return JsonResponse(serialized_files, safe=False)
        #self.object = UploadedFile.objects.create(uploaded_by=self.request.user, file=form.cleaned_data['file'])
        #return JsonResponse(serialize_file_model(self.object))

    def form_invalid(self, form: UploadForm):
        context = self.get_context_data(form=form)
        errors_json: str = context['form'].errors.get_json_data()
        return HttpResponseBadRequest(content=json.dumps({'errors': errors_json}))

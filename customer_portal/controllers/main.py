# -*- coding: utf-8 -*-
#################################################################################
# Author      : Acespritech Solutions Pvt. Ltd. (<www.acespritech.com>)
# Copyright(c): 2012-Present Acespritech Solutions Pvt. Ltd.
# All Rights Reserved.
#
# This program is copyright property of the author mentioned above.
# You can`t redistribute it and/or modify it.
#
#################################################################################

import json

from odoo import http
from odoo.http import request
from odoo.tools.translate import _
import werkzeug.utils
import hashlib
import odoo
from odoo import http
from odoo.http import request
import json
import logging
import uuid

try:
    from secrets import token_bytes
except ImportError:
    from os import urandom
    def token_bytes(nbytes=None):
        return urandom(nbytes)

_logger = logging.getLogger(__name__)


class Home(http.Controller):

    def is_authenticated(self):
        session_obj = request.env['customer_portal.session'].sudo()
        customer_portal_session_id = request.httprequest.cookies.get('customer_portal_session_id')
        session = session_obj.search([('session_token', '=', customer_portal_session_id), ('odoo_session_token', '=', request.session.sid)])
        if session:
            return session
        else:
            return False

    @http.route('/customer/portal/login', type='http', auth="none", sitemap=False, csrf=False)
    def customer_portal_login(self, **kw):
        if request.httprequest.method == 'POST':
            session_obj = request.env['customer_portal.session'].sudo()
            if self.is_authenticated():
                return werkzeug.utils.redirect('/customer/portal', 303)
            else:
                data = request.httprequest.values
                client_number = data.get('login', False)
                client_pin = data.get('password', False)
                if client_number and client_pin:
                    partner_obj = request.env['res.partner'].sudo()
                    partner = partner_obj.search([('client_number', '=', client_number), ('client_pin', '=', client_pin)], limit=1)
                    if partner:
                        token = uuid.UUID(bytes=token_bytes(16)).hex
                        session_obj.create({
                            'partner_id': partner.id,
                            'session_token': token,
                            'odoo_session_token': request.session.sid
                        })
                        redirect = werkzeug.utils.redirect('/customer/portal', 303)
                        redirect.set_cookie('customer_portal_session_id', token)
                        return redirect

        response = request.render('customer_portal.login')
        response.headers['X-Frame-Options'] = 'DENY'
        return response

    @http.route('/customer/portal/logout', type='http', auth="none", sitemap=False, csrf=False)
    def customer_portal_logout(self, **kw):
        session = self.is_authenticated()
        if self.is_authenticated():
            session.unlink()

        redirect = werkzeug.utils.redirect('/customer/portal', 303)
        redirect.set_cookie('customer_portal_session_id', '', 0)
        return redirect

    @http.route('/customer/portal', type='http', auth="none", sitemap=False)
    def customer_portal(self, **kw):
        session = self.is_authenticated()
        if not session:
            return werkzeug.utils.redirect('/customer/portal/login', 303)
        else:
            response = request.render('customer_portal.portal', {'partner': session.partner_id})
            response.headers['X-Frame-Options'] = 'DENY'
            return response

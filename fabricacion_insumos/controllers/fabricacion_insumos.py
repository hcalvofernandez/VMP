# -*- coding: utf-8 -*-
from odoo import http
from odoo.http import request
import werkzeug.utils
import json
import os

class fabricacion_insumos(http.Controller):
    @http.route('/fabricacion_insumos/init/', methods=['POST'], type='json', auth="public", website=True)
    def get_x_report_payments_form(self, **kw):   
        response = str("preparado funcion inicial")
        return response
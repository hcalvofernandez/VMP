# -*- coding: utf-8 -*-
from odoo import http
from odoo.http import request
import werkzeug.utils
import json
import os

class stock_variants_measure(http.Controller):
    @http.route('/stock_variants_measure/ready/', methods=['POST'], type='json', auth="public", website=True)
    def get_bigger_unit(self, **kw):  
        return str ("READY") 